/* Fair Play del Centroamericano 2026: la pantalla del encargado (centroamericano-fair-play.html, sin cuenta, con su
   QR), la misma en la pestaña «Fair Play» del árbitro principal (centroamericano-mesas.html, con los QR de los
   encargados) y el borde dorado en la tablet del árbitro de mesa (centroamericano-arbitro.html).

   Sin navegador:
   - supabase/functions/centroamericano-fair-play/analisis.ts: los emparejamientos de chess-results (con el número de
     cada jugador, su Elo y el bye), el PGN de Lichess con sus evaluaciones, la precisión con la fórmula de Lichess
     (sin la apertura ni lo ya decidido), la categoría de cada torneo de Lichess y la mesa de cada partida;
   - CentroamericanoMesas.fairPlayDeMesa(): lo que dice la banda dorada antes del resultado, con un resultado elegido,
     cuando gana quien no aplica, en tablas y si nadie jugó.
   Con un doble de la Edge Function centroamericano-fair-play que se porta como la base:
   - sin QR, o con uno que la función no acepta, no se arma nada y lo dice;
   - el encargado ve su nombre, las alertas de los tableros (con «Ya la miré» y «Seguirlo en los sorteos»), las mesas
     con su peso y quién no aplica, sortea (pregunta antes, con la ronda de cada categoría), aprueba, descarta con
     motivo, anota la revisión eligiendo a quién; NO ve la sección de los QR ni lee tablas directo (todo por la función);
   - el principal ve lo mismo y además crea y apaga los QR de los encargados;
   - la tablet del árbitro marca la mesa elegida con un borde dorado que brilla y una banda que dice a quién retener;
     al elegir el resultado, si gana quien no aplica, la banda dice que no aplica y la mesa queda sin efecto;
   - a 820 px no se desplaza a lo ancho y el texto da 4,5 o más, en claro y en oscuro.

   Ver «El sorteo de Fair Play» en docs/decisiones/juegos-y-torneos.md.

       node herramientas/verificar-todo.js centroamericano-fair-play      */
"use strict";
const { chromium } = require("./lib/playwright-con-sesion");
const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const { TOKEN, dobleArbitro } = require("./lib/doble-centroamericano-arbitro");

const BASE = process.env.BASE_URL || "http://localhost:8777";
const RAIZ = path.join(__dirname, "..");
const FP_TOKEN = "c".repeat(64);
let fallos = 0;
function igual(nombre, hallado, esperado) {
    const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
    if (a === b) console.log("  ✓ " + nombre);
    else { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos++; }
}

// ---------------------------------------------------------------- 1. el cálculo, sin navegador
function pruebasDelCalculo() {
    console.log("\n=== El cálculo (analisis.ts) ===");
    const html = '<table class="CRs1"><tr class="CRg1b"><th>M.</th><th>No.</th><th></th><th></th><th>White</th><th>Elo</th><th>Pts.</th><th>Resultado</th><th>Pts.</th><th></th><th>Black</th><th>Elo</th><th></th><th>No.</th></tr>'
        + '<tr><td class="CRc">1</td><td>2</td><td></td><td></td><td><a href="x.aspx?art=9&amp;snr=2">Garcia Tabasco, Alberto</a></td><td>2023</td><td>1</td> <td>1 - 0</td><td>1</td><td></td><td><a href="x.aspx?art=9&amp;snr=21">Reynoso Almonte, Owen</a></td><td>1596</td><td></td><td>21</td></tr>'
        + '<tr><td class="CRc">2</td><td>20</td><td></td><td></td><td><a href="x.aspx?snr=20">Ordonez Ch., Dylan</a></td><td>1609</td><td>1</td> <td></td><td>1</td><td>AIM</td><td><a href="x.aspx?snr=3">Farley, Jeremiah</a></td><td>1874</td><td></td><td>3</td></tr>'
        + '<tr><td class="CRc">3</td><td>45</td><td></td><td></td><td><a href="x.aspx?snr=45">Barrantes, Matias</a></td><td>0</td><td>1</td> <td>1 - -</td><td></td><td></td><td>bye</td><td></td><td></td><td></td></tr></table>';
    // Una partida de 40 jugadas: las blancas siempre dejan la evaluación igual (precisión ~100), las negras pierden 50
    // centipeones cada vez desde la jugada 9, hasta pasar los 6 peones (desde ahí ya no cuenta).
    let movs = "", ev = 20;
    for (let i = 1; i <= 40; i++) {
        movs += i + ". Nf3 { [%eval " + (ev / 100).toFixed(2) + "] } ";
        if (i >= 9) ev += 50;
        movs += i + "... Nf6 { [%eval " + (ev / 100).toFixed(2) + "] } ";
    }
    const pgn = '[Event "Round 2: A - B"]\n[Round "2.5"]\n[White "A"]\n[Black "B"]\n[Result "1-0"]\n[WhiteElo "1500"]\n[BlackElo "1600"]\n\n' + movs + "1-0\n\n"
        + '[Event "Round 2: C - D"]\n[Round "2.6"]\n[White "C"]\n[Black "D"]\n[Result "*"]\n\n1. e4 { [%eval #3] } *\n';
    const codigo = `
      const A = await import(${JSON.stringify(path.join(RAIZ, "supabase/functions/centroamericano-fair-play/analisis.ts"))});
      const p = A.leerPareos(${JSON.stringify(html)});
      const g = A.leerPgn(${JSON.stringify(pgn)});
      const m = A.medir(g[0].evals);
      console.log(JSON.stringify({ p, n: g.length, tags: [g[0].tags.Round, g[1].tags.Result], mate: g[1].evals[0], m,
        rm: A.rondaYMesa(g[0].tags), cats: ["Open U18", "Girls U08", "Open U10", "Girls U12", "Final"].map(A.categoriaDeLichess) }));`;
    const r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", codigo], { encoding: "utf8" });
    if (r.status !== 0) { console.log("  ✗ no se pudo correr analisis.ts: " + r.stderr); fallos++; return; }
    const d = JSON.parse(r.stdout);
    igual("chess-results: cada mesa con el número de cada jugador en el torneo, su nombre, su Elo y el resultado", d.p[0], { mesa: 1, snr_b: 2, snr_n: 21, blancas: "Garcia Tabasco, Alberto", negras: "Reynoso Almonte, Owen", elo_b: 2023, elo_n: 1596, resultado: "1 - 0" });
    igual("una mesa sin resultado todavía queda con el resultado vacío", [d.p[1].mesa, d.p[1].negras, d.p[1].resultado], [2, "Farley, Jeremiah", ""]);
    igual("el bye: un solo jugador, negras vacío y sin Elo inventado (un 0 no es un Elo)", [d.p[2].mesa, d.p[2].negras, d.p[2].snr_n, d.p[2].elo_b], [3, "", null, null]);
    igual("Lichess: cada partida con sus etiquetas, y un mate vale ±10000", [d.n, d.tags, d.mate], [2, ["2.5", "*"], 10000]);
    igual("«Round 2.5» es la ronda 2, mesa 5", d.rm, { ronda: 2, mesa: 5 });
    igual("la precisión sale sin la apertura (desde la jugada 9) y sin lo ya decidido (6 peones): blancas perfectas y negras bajas, con el mismo número de jugadas medidas", [d.m.blancas.precision > 99, d.m.negras.precision < 90, d.m.blancas.jugadas, d.m.negras.jugadas, d.m.negras.acpl], [true, true, 12, 12, 50]);
    igual("la categoría de cada torneo de Lichess, como la escribe centroamericano_torneos", d.cats, [{ categoria: "Sub-18", rama: "Absoluto" }, { categoria: "Sub-8", rama: "Femenino" }, { categoria: "Sub-10", rama: "Absoluto" }, { categoria: "Sub-12", rama: "Femenino" }, null]);

    console.log("\n=== La banda dorada de la tablet (fairPlayDeMesa) ===");
    const C = require(path.join(RAIZ, "js/centroamericano-mesas.js"));
    const fp = { estado: "aprobada", color_si_tablas: "blancas", aplica_blancas: true, aplica_negras: false, no_aplica: "Seis, Fio no aplica: se revisó en la ronda 2" };
    const m = { mesa: 3, blancas: "Cinco, Eva", negras: "Seis, Fio", valor: "0" };
    const t = (v, mm) => C.fairPlayDeMesa(fp, mm || m, v);
    igual("sin resultado: retener al ganador, el color si es tablas y quién no aplica", [t().tipo, /retén al GANADOR/.test(t().texto), /juega con blancas/.test(t().texto), /Seis, Fio no aplica: se revisó en la ronda 2/.test(t().texto)], ["esperando", true, true, true]);
    igual("si el árbitro elige que gana quien SÍ aplica: «retén a Cinco, Eva»", [t("1").tipo, /retén a Cinco, Eva \(blancas\)/.test(t("1").texto)], ["retener", true]);
    igual("si elige que gana quien NO aplica: lo dice y la mesa queda sin efecto, con el motivo de esa persona", [t("3").tipo, t("3").texto], ["no-aplica", "🛡 Fair Play: con este resultado, Seis, Fio NO APLICA (se revisó en la ronda 2). La mesa queda sin efecto: no hace falta retenerlo."]);
    igual("en tablas se retiene al color sorteado; si nadie jugó, sin efecto; ya revisada, solo lo dice", [t("2").tipo, /Cinco, Eva/.test(t("2").texto), t("6").tipo, C.fairPlayDeMesa(Object.assign({}, fp, { estado: "revisada" }), m).tipo], ["retener", true, "no-aplica", "revisada"]);
    igual("con el resultado ya en chess-results (sin elegir otro) dice lo mismo, sin «con este resultado»", [t(undefined, Object.assign({}, m, { valor: "3" })).tipo, /con este resultado/.test(t(undefined, Object.assign({}, m, { valor: "3" })).texto)], ["no-aplica", false]);
    igual("una mesa que no es de Fair Play no lleva banda", C.fairPlayDeMesa(undefined, m, "1"), null);
}

// ---------------------------------------------------------------- 2. el doble de la Edge Function
// Lo mismo que hacen la función y la base: el QR, la ronda de cada categoría, las candidatas con su peso y quién no
// aplica, el sorteo sin repetir, aprobar, descartar con motivo, revisar (con nota si no fue «Sin novedad») y las alertas.
const SERVIDOR_FP = `
  window.__fp = { llamadas: [], enlaces: [{ id: "en-1", token: "${"d".repeat(64)}", nombre: "Laura Mora", vence: "2099-01-01T00:00:00Z", revocada: false, creada: "2026-11-03T10:00:00Z", ultimo_uso: null }],
    rondas: [{ tnr: "100", nombre: "Sub-12 Absoluto", prueba: false, ronda: 3 }, { tnr: "200", nombre: "Sub-14 Femenino", prueba: false, ronda: 3 }, { tnr: "900", nombre: "PRUEBA", prueba: true, ronda: 1 }],
    mesas: {
      "100": [
        { mesa: 1, blancas: "Clark, Arty", negras: "Garcia, Alberto", snr_b: 15, snr_n: 2, elo_b: 1644, elo_n: 2023, peso: 1.5, motivos: ["Diferencia de 379 de Elo"], aplica_blancas: true, aplica_negras: true, no_aplica: null, excluida: null },
        { mesa: 2, blancas: "Cinco, Eva", negras: "Seis, Fio", snr_b: 5, snr_n: 6, elo_b: 1700, elo_n: 1710, peso: 2, motivos: ["Se levantó 2 veces en esta ronda"], aplica_blancas: true, aplica_negras: false, no_aplica: "Seis, Fio no aplica: se revisó en la ronda 2", excluida: null },
        { mesa: 3, blancas: "Siete, Gil", negras: "Ocho, Hugo", snr_b: 7, snr_n: 8, elo_b: 1500, elo_n: 1500, peso: 1, motivos: [], aplica_blancas: false, aplica_negras: false, no_aplica: "…", excluida: "Ninguno de los dos aplica" }],
      "200": [{ mesa: 1, blancas: "Ana", negras: "Bea", snr_b: 1, snr_n: 2, elo_b: 1400, elo_n: 1420, peso: 1, motivos: [], aplica_blancas: true, aplica_negras: true, no_aplica: null, excluida: null }],
      "900": [] },
    sorteos: [],
    alertas: [{ tnr: "100", ronda: 2, mesa: 4, color: "negras", jugador: "Castro, Alana", elo: 1588, rival: "Ruiz, Mia", rival_elo: 1810, resultado: "0-1", jugadas: 36, precision: 97.13, acpl: 7.7, esperada: 87.5, z: 2.6, nivel: "alta", partida_url: "https://lichess.org/broadcast/x/y/z", estado: "nueva", nota: null, vista_por_nombre: null, vista_en: null }],
    avisos: [] };
  let n = 0;
  window.__fpServidor = (b, conSesion) => {
    const S = window.__fp; S.llamadas.push(JSON.parse(JSON.stringify(b)));
    const err = (estado, error) => ({ data: null, error: { context: { status: estado, json: () => Promise.resolve({ error }) } } });
    const ok = (d) => ({ data: Object.assign({ ok: true }, d), error: null });
    if (b.action === "mesas_arbitro") return ok({ mesas: S.sorteos.filter((f) => f.estado !== "sorteada" && f.estado !== "descartada").map((f) => ({ mesa: f.mesa, estado: f.estado, color_si_tablas: f.color_si_tablas, aplica_blancas: f.aplica_blancas, aplica_negras: f.aplica_negras, no_aplica: f.no_aplica, revisar_color: f.revisar_color || null })) });
    let quien;
    if (b.token) { const e = S.enlaces.find((x) => x.token === b.token); if (!e) return err(404, "Este enlace no es válido. Pídele al árbitro principal que te mande el QR de nuevo."); if (e.revocada) return err(410, "El árbitro principal apagó este enlace."); quien = e.nombre + " (Fair Play)"; }
    else if (conSesion) quien = "Oscar Principal"; else return err(401, "Falta el enlace de Fair Play.");
    const rondas = S.rondas.filter((r) => !b.token || !r.prueba);
    if (b.action === "leer") return ok({ nombre: quien.replace(" (Fair Play)", ""), principal: !b.token, rondas, sorteos: S.sorteos.filter((f) => rondas.some((r) => r.tnr === f.tnr)), alertas: S.alertas.filter((a) => a.estado === "seguir" || a.nivel !== "normal"), leidos: Object.fromEntries(S.avisos.map((a) => [a.id, a.leido_en])), actualizado: "2026-11-03T16:00:00Z" });
    if (b.action === "candidatas") return ok({ mesas: (S.mesas[b.tnr] || []).map((m) => Object.assign({}, m, { excluida: m.excluida || (S.sorteos.some((f) => f.tnr === b.tnr && f.ronda === b.ronda && f.mesa === m.mesa) ? "Ya salió en esta ronda" : null) })) });
    if (b.action === "sortear") {
      const salen = [];
      for (const tnr of b.tnrs) {
        const pozo = (S.mesas[tnr] || []).filter((m) => !m.excluida && !S.sorteos.some((f) => f.tnr === tnr && f.ronda === b.ronda && f.mesa === m.mesa));
        for (const m of pozo.slice(0, b.cantidad)) {
          const f = Object.assign({}, m, { id: "fp-" + (++n), tnr, ronda: b.ronda, mesas_en_sorteo: pozo.length, color_si_tablas: m.aplica_negras ? "negras" : "blancas", estado: "sorteada", sorteada_por: quien, creado: new Date().toISOString() });
          delete f.excluida; S.sorteos.push(f); salen.push(f);
        }
      }
      return ok({ sorteos: salen });
    }
    const f = S.sorteos.find((x) => x.id === b.id);
    if (b.action === "aprobar") {
      if (!f || f.estado !== "sorteada") return err(400, "Ese sorteo ya se decidió");
      const av = { id: "av-" + (++n), leido_en: null, mesa: f.mesa, texto: "🛡 FAIR PLAY · mesa " + f.mesa }; S.avisos.push(av);
      Object.assign(f, { estado: "aprobada", aviso_id: av.id, arbitro: "Ana Árbitra", decidida_por_nombre: quien }); return ok({ sorteo: f });
    }
    if (b.action === "descartar") { if (!String(b.motivo || "").trim()) return err(400, "Para descartar una mesa hace falta el motivo"); Object.assign(f, { estado: "descartada", motivo: b.motivo }); return ok({ sorteo: f }); }
    if (b.action === "revisar") {
      if (b.resultado !== "sin_novedad" && !String(b.nota || "").trim()) return err(400, "Con ese resultado hace falta anotar qué pasó");
      Object.assign(f, { estado: "revisada", resultado: b.resultado, jugador_color: b.color, jugador: b.color === "negras" ? f.negras : f.blancas, nota: b.nota || null, revisada_por_nombre: quien }); return ok({ sorteo: f });
    }
    if (b.action === "alerta") { const a = S.alertas.find((x) => x.tnr === b.tnr && x.ronda === b.ronda && x.mesa === b.mesa && x.color === b.color); Object.assign(a, { estado: b.estado, nota: b.nota, vista_por_nombre: quien, vista_en: new Date().toISOString() }); return ok({ alerta: a }); }
    if (b.action === "actualizar") return ok({ pareos: 30, analizadas: 4, errores: [] });
    if (b.action === "pareo") return ok({ pareo: b.tnr === "100" && b.ronda === 2 && b.mesa === 7 ? { blancas: "Tres, Caro", negras: "Once, Kai", elo_b: 1600, elo_n: 1500, resultado: "1 - 0" } : null });
    if (b.action === "manual") {
      if (b.resultado !== "sin_novedad" && !String(b.nota || "").trim()) return err(400, "Con ese resultado hace falta anotar qué pasó");
      if (S.sorteos.some((f) => f.tnr === b.tnr && f.ronda === b.ronda && f.mesa === b.mesa)) return err(400, "La mesa " + b.mesa + " de la ronda " + b.ronda + " ya tiene un registro de Fair Play: corrígelo desde la lista");
      const jug = b.tnr === "100" && b.ronda === 2 && b.mesa === 7 ? (b.color === "negras" ? "Once, Kai" : "Tres, Caro") : b.jugador;
      if (!jug) return err(400, "No sé quién jugó en esa mesa: escribe el nombre del jugador");
      const f = { id: "fp-" + (++n), tnr: b.tnr, ronda: b.ronda, mesa: b.mesa, mesas_en_sorteo: 1, color_si_tablas: b.color, estado: "revisada", origen: "manual", resultado: b.resultado, jugador: jug, jugador_color: b.color, nota: b.nota || null, sorteada_por: quien, revisada_por_nombre: quien, motivos: ["Anotada a mano"], peso: 1, creado: new Date().toISOString() };
      S.sorteos.push(f); return ok({ sorteo: f });
    }
    return err(400, "Acción desconocida.");
  };`;

// La pantalla del encargado: solo la función (functions.invoke); cualquier lectura directa de una tabla queda anotada.
const DOBLE_ENCARGADO = `(function(){
  ${SERVIDOR_FP}
  window.__directo = [];
  const R = (data, error) => Promise.resolve({ data, error: error || null });
  window.sb = {
    auth: { getSession: () => R({ session: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    functions: { invoke: (f, o) => f === "centroamericano-fair-play" ? Promise.resolve(window.__fpServidor(o.body, false)) : R(null, { message: "otra función" }) },
    rpc: (f) => { window.__directo.push("rpc " + f); return R(null, { message: "sin permiso" }); },
    from: (t) => { window.__directo.push("from " + t); const q = {}; ["select","eq","order","range","insert","update","in"].forEach((m) => q[m] = () => q); q.then = (ok) => R(null, { message: "sin permiso" }).then(ok); return q; },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {},
  };
})();`;

// La pestaña del principal: su sesión, la función sin token, y los QR de los encargados por la tabla (con su RLS).
const DOBLE_PRINCIPAL = `(function(){
  ${SERVIDOR_FP}
  window.__llamadas = [];
  const R = (data, error) => Promise.resolve({ data, error: error || null });
  const T = { centroamericano_torneos: [{ tnr: "100", nombre: "Sub-12 Absoluto", orden: 1, sid_en_boveda: true, acceso_tnr: "100" }], centroamericano_fp_enlaces: window.__fp.enlaces };
  window.sb = {
    auth: { getSession: () => R({ session: { user: { id: "yo" }, access_token: "x" } }), getUser: () => R({ user: { id: "yo" } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      mfa: { getAuthenticatorAssuranceLevel: () => R({ currentLevel: "aal1", nextLevel: "aal1" }), listFactors: () => R({ all: [], totp: [] }) } },
    rpc: (f, a) => R(f === "tengo_herramienta" ? a.p_herramienta === "mesa-arbitro" : null),
    storage: { from: () => ({ createSignedUrl: () => R({ signedUrl: "" }) }) },
    functions: { invoke: (f, o) => f === "centroamericano-fair-play" ? Promise.resolve(window.__fpServidor(o.body, true)) : R({ ok: true }) },
    from: (tabla) => { const f = {}; let accion = "select", valores = null;
      const q = { select: () => q, order: () => q, range: () => q, limit: () => q, in: () => q, is: () => q, eq: (c, v) => { f[c] = v; return q; },
        maybeSingle: () => R(null), insert: (v) => { accion = "insert"; valores = v; return q; }, update: (v) => { accion = "update"; valores = v; return q; },
        then: (ok, ko) => { const L = T[tabla] || [];
          if (accion === "insert") { L.push(Object.assign({ id: "en-" + (L.length + 1), token: "e".repeat(64), revocada: false, creada: new Date().toISOString(), ultimo_uso: null }, valores)); window.__llamadas.push({ insert: tabla, valores }); return R(null).then(ok, ko); }
          if (accion === "update") { L.filter((r) => Object.entries(f).every(([c, v]) => r[c] === v)).forEach((r) => Object.assign(r, valores)); window.__llamadas.push({ update: tabla, valores, f }); return R(null).then(ok, ko); }
          return R(L.filter((r) => Object.entries(f).every(([c, v]) => r[c] === v)).map((r) => Object.assign({}, r))).then(ok, ko); } };
      return q; },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {},
  };
})();`;

async function abrir(browser, pagina, doble, { hash = "", ancho = 820, esquema = "light" } = {}) {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: ancho, height: 900 }, acceptDownloads: true, colorScheme: esquema });
    await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ contentType: "application/javascript", body: doble }));
    await ctx.route("**/js/vendor/supabase.js", (r) => r.fulfill({ contentType: "application/javascript", body: "" }));
    await ctx.route(/supabase\.co|sentry|googletagmanager|cloudflareinsights/, (r) => r.abort());
    const p = await ctx.newPage();
    const errores = [];
    p.on("pageerror", (e) => errores.push(e.message));
    await p.goto(BASE + "/" + pagina + (hash ? "#" + hash : ""), { waitUntil: "load" });
    return { ctx, p, errores };
}

const CONTRASTE = (sel) => {
    const luz = (c) => { const v = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
    const rgba = (s) => { const m = s.match(/[\d.]+/g).map(Number); return { c: m.slice(0, 3), a: m.length > 3 ? m[3] : 1 }; };
    const fondo = (n) => { for (let x = n; x; x = x.parentElement) { const b = rgba(getComputedStyle(x).backgroundColor); if (b.a >= 0.99) return b.c; } return [255, 255, 255]; };
    return [...document.querySelectorAll(sel)].filter((n) => n.checkVisibility() && [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())).map((n) => {
        const a = luz(rgba(getComputedStyle(n).color).c), b = luz(fondo(n));
        return [n.textContent.trim().slice(0, 30), Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100]; }).filter((x) => x[1] < 4.5);
};
const TEXTO_PANEL = "#fp-app p, #fp-app td, #fp-app td span, #fp-app .cam-chip, #fp-app li, #fp-app summary, #fp-app h3, #fp-app strong";

(async () => {
    pruebasDelCalculo();
    const browser = await chromium.launch();
    try {
        console.log("\n=== La pantalla del encargado: el QR ===");
        let e = await abrir(browser, "centroamericano-fair-play.html", DOBLE_ENCARGADO);
        await e.p.waitForFunction(() => !document.getElementById("sin-enlace").hidden);
        igual("sin QR no se arma nada y dice que se abre con el QR de Fair Play", await e.p.evaluate(() => [document.getElementById("sin-enlace").textContent.includes("QR de Fair Play"), document.getElementById("fp-app").checkVisibility(), window.__fp.llamadas.length]), [true, false, 0]);
        await e.ctx.close();
        e = await abrir(browser, "centroamericano-fair-play.html", DOBLE_ENCARGADO, { hash: "f".repeat(64) });
        await e.p.waitForFunction(() => !document.getElementById("sin-enlace").hidden);
        igual("con un QR que la función no acepta, dice lo que contestó la función", await e.p.$eval("#sin-enlace", (n) => n.textContent), "Este enlace no es válido. Pídele al árbitro principal que te mande el QR de nuevo.");
        await e.ctx.close();

        console.log("\n=== La pantalla del encargado: sortear, aprobar, revisar y las alertas ===");
        e = await abrir(browser, "centroamericano-fair-play.html", DOBLE_ENCARGADO, { hash: "d".repeat(64) });
        const p = e.p;
        await p.waitForFunction(() => document.getElementById("fp-categoria") && document.getElementById("fp-categoria").options.length > 1);
        igual("dice quién es el encargado, y el título de la pestaña lleva su nombre", await p.evaluate(() => [document.getElementById("fp-estado").textContent.startsWith("Encargado: Laura Mora · chess-results y Lichess leídos a las "), document.title.startsWith("Fair Play de Laura Mora")]), [true, true]);
        igual("las categorías con su ronda, sin las de ensayo", await p.$$eval("#fp-categoria option", (l) => l.map((o) => o.textContent)), ["Todas las categorías (2)", "Sub-12 Absoluto — ronda 3", "Sub-14 Femenino — ronda 3"]);
        igual("el encargado NO ve la sección de los QR de los encargados y no lee ninguna tabla directo: todo pasa por la función", await p.evaluate(() => [!!document.getElementById("fp-t-encargados"), window.__directo]), [false, []]);
        igual("la pantalla no tiene texto suelto («null») de una sección que no va", await p.evaluate(() => [...document.getElementById("fp-app").childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).length), 0);
        igual("la alerta de los tableros: jugador, Elo, rival, precisión contra la esperable, desviaciones, la partida en Lichess y sus dos botones", await p.$eval(".cam-fp-alerta", (a) => [a.dataset.nivel, a.querySelector(".cam-chip").textContent, /Castro, Alana \(1588\).*contra Ruiz, Mia \(1810\)/.test(a.textContent), /Precisión 97,1 % en 36 jugadas · la esperable para su Elo: 87,5 % · 2,6 desviaciones arriba/.test(a.textContent), !!a.querySelector('a[href^="https://lichess.org/"]'), [...a.querySelectorAll("button")].map((b) => b.textContent)]),
            ["alta", "Muy alta", true, true, true, ["Ya la miré", "Seguirlo en los sorteos"]]);
        igual("el contador de alertas nuevas", await p.evaluate(() => [document.getElementById("fp-alertas-n").checkVisibility(), document.getElementById("fp-alertas-n").textContent]), [true, "1"]);
        await p.click('.cam-fp-alerta [data-accion="seguir"]');
        await p.waitForSelector("dialog[open] input, dialog[open] textarea");
        await p.fill("dialog[open] input, dialog[open] textarea", "Muy rápida en el medio juego");
        await p.click("dialog[open] [data-avisos-aceptar]");
        await p.waitForFunction(() => document.querySelector(".cam-fp-alerta").dataset.estado === "seguir");
        igual("«Seguirlo en los sorteos» llega a la función con la nota, y queda con quién y cuándo", await p.evaluate(() => [window.__fp.llamadas.filter((l) => l.action === "alerta").map((l) => [l.estado, l.nota, l.token.length]), /En seguimiento por Laura Mora \(Fair Play\) a las .*: Muy rápida en el medio juego/.test(document.querySelector(".cam-fp-alerta").textContent), document.getElementById("fp-alertas-n").hidden]),
            [[["seguir", "Muy rápida en el medio juego", 64]], true, true]);

        await p.click("#fp-ver-mesas");
        await p.waitForFunction(() => document.querySelectorAll("#fp-mesas tr").length === 3);
        igual("«Ver las mesas y su peso»: cada mesa con su Elo, su peso y su porcentaje, por qué pesa y quién no aplica; la que no entra dice por qué", await p.$$eval("#fp-mesas tr", (l) => l.map((tr) => [...tr.children].map((td) => td.textContent))),
            [["1", "Clark, Arty (1644)", "Garcia, Alberto (2023)", "1,5 (43 %)", "Diferencia de 379 de Elo", "—"],
             ["2", "Cinco, Eva (1700)", "Seis, Fio (1710)", "2 (57 %)", "Se levantó 2 veces en esta ronda", "Seis, Fio no aplica: se revisó en la ronda 2"],
             ["3", "Siete, Gil (1500)", "Ocho, Hugo (1500)", "—", "Ninguno de los dos aplica", "…"]]);
        igual("el botón dice si la lista está abierta", await p.getAttribute("#fp-ver-mesas", "aria-expanded"), "true");

        await p.selectOption("#fp-categoria", "100");
        await p.selectOption("#fp-cantidad", "2");
        await p.click("#fp-sortear");
        await p.waitForSelector("dialog[open]");
        igual("antes de sortear pregunta, con la categoría, la ronda y que todavía no se avisa a nadie", await p.evaluate(() => { const t = document.querySelector("dialog[open]").textContent; return [t.includes("2 mesas en Sub-12 Absoluto (ronda 3)"), t.includes("Todavía no se avisa a nadie")]; }), [true, true]);
        await p.click("dialog[open] [data-avisos-aceptar]");
        await p.waitForFunction(() => document.querySelectorAll("#fp-lista tr").length === 2);
        igual("el sorteo llega a la función con SU ronda y el token; salen 2 mesas «de 2», con el peso, los motivos y quién no aplica", await p.evaluate(() => [window.__fp.llamadas.filter((l) => l.action === "sortear").map((l) => [l.ronda, l.tnrs, l.cantidad, l.token.length]),
            [...document.querySelectorAll("#fp-lista tr")].map((tr) => [tr.children[2].textContent, tr.children[3].textContent, tr.children[4].textContent])]),
            [[[3, ["100"], 2, 64]], [["Mesa 1 (de 2, peso 1,5)Diferencia de 379 de Elo", "Blancas: Clark, Arty (1644)Negras: Garcia, Alberto (2023)", "El ganador · si es tablas: Negras"],
                                     ["Mesa 2 (de 2, peso 2)Se levantó 2 veces en esta ronda", "Blancas: Cinco, Eva (1700)Negras: Seis, Fio (1710)⚠ Seis, Fio no aplica: se revisó en la ronda 2", "El ganador · si es tablas: Blancas"]]]);
        const fila = (mesa) => '#fp-lista tr:nth-child(' + mesa + ')';
        await p.click(fila(2) + ' [data-accion="aprobar"]');
        await p.waitForSelector("dialog[open]");
        igual("aprobar avisa del borde dorado y de quién no aplica", await p.evaluate(() => { const t = document.querySelector("dialog[open]").textContent; return [t.includes("borde dorado"), t.includes("Ojo: Seis, Fio no aplica")]; }), [true, true]);
        await p.click("dialog[open] [data-avisos-aceptar]");
        await p.waitForFunction((s) => document.querySelector(s).dataset.estado === "aprobada", fila(2));
        igual("aprobada: le llegó el aviso a su árbitro y la fila dice que todavía no lo lee", await p.$eval(fila(2), (tr) => tr.children[5].textContent), "Aprobada: avisado su árbitro⏳ Ana Árbitra todavía no lo ha leído");
        await p.click(fila(1) + ' [data-accion="descartar"]');
        await p.waitForSelector("dialog[open] input, dialog[open] textarea");
        await p.click("dialog[open] [data-avisos-aceptar]");
        await p.waitForTimeout(300);
        igual("descartar sin motivo no llega a la función", await p.evaluate(() => window.__fp.llamadas.filter((l) => l.action === "descartar").length), 0);
        await p.click(fila(2) + ' [data-accion="revisar"]');
        await p.waitForSelector("dialog[open] select");
        igual("la revisión pregunta a quién se revisó entre los dos de la mesa", await p.$$eval("dialog[open] select", (l) => l.map((s) => [...s.options].map((o) => o.textContent))[1]), ["Cinco, Eva (blancas)", "Seis, Fio (negras)"]);
        await p.selectOption("dialog[open] select >> nth=0", "se_nego");
        await p.click("dialog[open] [data-avisos-aceptar]");
        await p.waitForFunction(() => /hace falta anotar qué pasó/.test(document.body.textContent));
        igual("«Se negó» sin decir qué pasó: la función lo rechaza y la mesa sigue aprobada", await p.$eval(fila(2), (tr) => tr.dataset.estado), "aprobada");
        await p.click(fila(2) + ' [data-accion="revisar"]');
        await p.waitForSelector("dialog[open] select");
        await p.selectOption("dialog[open] select >> nth=0", "sin_novedad");
        await p.selectOption("dialog[open] select >> nth=1", "blancas");
        await p.click("dialog[open] [data-avisos-aceptar]");
        await p.waitForFunction((s) => document.querySelector(s).dataset.estado === "revisada", fila(2));
        igual("«Sin novedad» con Cinco, Eva: queda revisada con su nombre y quién la revisó", await p.$eval(fila(2), (tr) => [tr.children[4].textContent, tr.children[5].textContent]), ["Cinco, Eva", "RevisadaSin novedad · Laura Mora (Fair Play)"]);
        console.log("\n=== Anotar a mano una revisión de una ronda anterior ===");
        await p.click("#fp-manual");
        await p.waitForSelector("dialog[open] select");
        igual("primero pregunta la categoría, la ronda (de la 1 a la abierta, y empieza en la anterior) y la mesa", await p.$$eval("dialog[open] select", (l) => [[...l[0].options].map((o) => o.textContent), [...l[1].options].map((o) => o.textContent), l[1].value]), [["Sub-12 Absoluto", "Sub-14 Femenino"], ["Ronda 1", "Ronda 2", "Ronda 3"], "2"]);
        await p.selectOption("dialog[open] select >> nth=0", "100");
        await p.fill('dialog[open] input:not([type="hidden"])', "7");
        await p.click("dialog[open] [data-avisos-aceptar]");
        await p.waitForFunction(() => { const d = document.querySelector("dialog[open]"); return d && /ronda 2, mesa 7/.test(d.textContent); });
        igual("después, los dos jugadores de esa mesa con su Elo (de chess-results) para elegir a quién se revisó", await p.$$eval("dialog[open] select", (l) => [...l[0].options].map((o) => o.textContent)), ["Tres, Caro (1600) (blancas)", "Once, Kai (1500) (negras)"]);
        await p.selectOption("dialog[open] select >> nth=0", "negras");
        await p.selectOption("dialog[open] select >> nth=1", "hallazgo");
        await p.click("dialog[open] [data-avisos-aceptar]");
        await p.waitForFunction(() => /hace falta anotar qué pasó/.test(document.body.textContent));
        igual("un hallazgo sin decir qué pasó no se guarda (lo rechaza la base)", await p.evaluate(() => window.__fp.sorteos.filter((f) => f.origen === "manual").length), 0);
        await p.click("#fp-manual");
        await p.waitForSelector("dialog[open] select");
        await p.selectOption("dialog[open] select >> nth=0", "100");
        await p.fill('dialog[open] input:not([type="hidden"])', "7");
        await p.click("dialog[open] [data-avisos-aceptar]");
        await p.waitForFunction(() => { const d = document.querySelector("dialog[open]"); return d && /ronda 2, mesa 7/.test(d.textContent); });
        await p.selectOption("dialog[open] select >> nth=0", "negras");
        await p.selectOption("dialog[open] select >> nth=1", "hallazgo");
        await p.fill("dialog[open] textarea", "Tenía un papel con jugadas");
        await p.click("dialog[open] [data-avisos-aceptar]");
        await p.waitForFunction(() => document.querySelectorAll("#fp-lista tr").length === 3);
        igual("anotada: llega a la función con la categoría, la ronda, la mesa, a quién, el hallazgo y la nota, y el token del encargado", await p.evaluate(() => window.__fp.llamadas.filter((l) => l.action === "manual").map((l) => [l.tnr, l.ronda, l.mesa, l.color, l.resultado, l.nota, l.token.length]).pop()), ["100", 2, 7, "negras", "hallazgo", "Tenía un papel con jugadas", 64]);
        igual("en la lista: ronda 2, «Anotada a mano por» el encargado, a quién y el hallazgo", await p.$$eval("#fp-lista tr", (l) => l.filter((tr) => tr.children[1].textContent === "2").map((tr) => [tr.children[2].textContent, tr.children[4].textContent, tr.children[5].textContent])),
            [["Mesa 7Anotada a mano por Laura Mora (Fair Play)", "Once, Kai", "RevisadaHallazgo (se informa al principal) · Tenía un papel con jugadas · Laura Mora (Fair Play)"]]);
        // Una mesa sin emparejamientos leídos: pide escribir el nombre.
        await p.click("#fp-manual");
        await p.waitForSelector("dialog[open] select");
        await p.selectOption("dialog[open] select >> nth=0", "200");
        await p.selectOption("dialog[open] select >> nth=1", "1");
        await p.fill('dialog[open] input:not([type="hidden"])', "3");
        await p.click("dialog[open] [data-avisos-aceptar]");
        await p.waitForFunction(() => { const d = document.querySelector("dialog[open]"); return d && /ronda 1, mesa 3/.test(d.textContent); });
        igual("sin los emparejamientos de esa mesa, pide escribir el nombre (y con qué color jugaba)", await p.evaluate(() => [/escribe el nombre como aparece en chess-results/.test(document.querySelector("dialog[open]").textContent), !!document.querySelector('dialog[open] input:not([type="hidden"])')]), [true, true]);
        await p.fill('dialog[open] input:not([type="hidden"])', "Ana Pérez");
        await p.click("dialog[open] [data-avisos-aceptar]");
        await p.waitForFunction(() => document.querySelectorAll("#fp-lista tr").length === 4);
        igual("y queda con ese nombre", await p.evaluate(() => window.__fp.sorteos.filter((f) => f.origen === "manual").map((f) => [f.tnr, f.ronda, f.mesa, f.jugador, f.resultado])), [["100", 2, 7, "Once, Kai", "hallazgo"], ["200", 1, 3, "Ana Pérez", "sin_novedad"]]);

        const [bajada] = await Promise.all([p.waitForEvent("download"), p.click("#fp-pdf")]);
        const bytes = fs.readFileSync(await bajada.path()).toString("latin1");
        igual("el registro en PDF, con la marca de agua", [bajada.suggestedFilename(), bytes.startsWith("%PDF"), /\/SMask \d+ 0 R/.test(bytes)], ["fair-play-centroamericano-2026.pdf", true, true]);
        igual("a 820 px no se desplaza a lo ancho, y sin errores en la página", await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth).then((x) => [x, e.errores]), [true, []]);
        igual("en claro, todo el texto da 4,5 o más", await p.evaluate(CONTRASTE, TEXTO_PANEL), []);
        await e.ctx.close();
        const o = await abrir(browser, "centroamericano-fair-play.html", DOBLE_ENCARGADO, { hash: "d".repeat(64), esquema: "dark" });
        await o.p.waitForSelector(".cam-fp-alerta");
        await o.p.evaluate(() => { document.querySelector(".cam-fp-reglas").open = true; });
        igual("en oscuro, todo el texto da 4,5 o más", await o.p.evaluate(CONTRASTE, TEXTO_PANEL), []);
        await o.ctx.close();

        console.log("\n=== La pestaña del árbitro principal: los QR de los encargados ===");
        const q = await abrir(browser, "centroamericano-mesas.html", DOBLE_PRINCIPAL, { hash: "fairplay" });
        await q.p.waitForFunction(() => document.querySelectorAll("#fp-enlaces .cam-fp-enlace").length === 1);
        igual("es la misma pantalla (sortear, alertas, sorteadas) y además los encargados con su QR; la función se llama sin token (con la sesión)", await q.p.evaluate(() => [!!document.getElementById("fp-sortear"), !!document.getElementById("fp-alertas"), document.querySelector("#fp-enlaces .cam-fp-enlace p").textContent, !!document.querySelector("#fp-enlaces svg"), window.__fp.llamadas.every((l) => !l.token)]), [true, true, "Laura Mora", true, true]);
        await q.p.fill("#fp-enlace-nombre", "Pedro Solís");
        await q.p.click('#fp-form-enlace button[type="submit"]');
        await q.p.waitForFunction(() => document.querySelectorAll("#fp-enlaces .cam-fp-enlace").length === 2);
        igual("«Crear su QR» crea el enlace con el nombre y el vencimiento del torneo", await q.p.evaluate(() => window.__llamadas.filter((l) => l.insert === "centroamericano_fp_enlaces").map((l) => l.valores)), [{ nombre: "Pedro Solís", vence: "2026-11-10T05:59:59Z" }]);
        await q.p.click('#fp-enlaces .cam-fp-enlace[data-id="en-1"] [data-accion="apagar"]');
        await q.p.waitForSelector("dialog[open]");
        await q.p.click("dialog[open] [data-avisos-aceptar]");
        await q.p.waitForFunction(() => document.querySelectorAll("#fp-enlaces .cam-fp-enlace").length === 1);
        igual("«Apagar» lo apaga (no lo borra) y deja de verse", await q.p.evaluate(() => window.__llamadas.filter((l) => l.update === "centroamericano_fp_enlaces").map((l) => [l.valores, l.f])), [[{ revocada: true }, { id: "en-1" }]]);
        igual("y sin errores en la página", q.errores, []);
        await q.ctx.close();

        console.log("\n=== La tablet del árbitro: el borde dorado ===");
        const t = await abrir(browser, "centroamericano-arbitro.html", dobleArbitro(), { hash: TOKEN });
        await t.p.waitForSelector(".cam-mesa");
        // La función de Fair Play contesta que su mesa 2 está aprobada y que si ganan negras no aplica.
        await t.p.evaluate(() => {
            const original = window.sb.functions.invoke;
            const negras = "Acuña Porras Fabio";   // la mesa 2 del doble (MESAS de lib/doble-centroamericano-arbitro.js)
            window.__mesasFp = [{ mesa: 2, estado: "aprobada", color_si_tablas: "blancas", aplica_blancas: true, aplica_negras: false, no_aplica: negras + " no aplica: se revisó en la ronda 1", revisar_color: null }];
            window.sb.functions.invoke = (f, o) => f === "centroamericano-fair-play" ? Promise.resolve({ data: { ok: true, mesas: window.__mesasFp }, error: null }) : original(f, o);
        });
        await t.p.click("#actualizar");
        await t.p.waitForSelector('.cam-mesa[data-fair-play="aprobada"]', { timeout: 30000 });
        const mesa2 = '.cam-mesa[data-mesa="2"]';
        igual("solo su mesa elegida lleva el borde dorado que brilla (y la banda lo dice escrito)", await t.p.evaluate((s) => { const a = document.querySelector(s); const cs = getComputedStyle(a);
            return [document.querySelectorAll(".cam-mesa[data-fair-play]").length, cs.borderTopColor, cs.animationName, a.querySelector(".cam-fp-banda").checkVisibility(), /retén al GANADOR/.test(a.querySelector(".cam-fp-banda").textContent), a.getAttribute("aria-label")]; }, mesa2),
            [1, "rgb(184, 134, 11)", "cam-fp-brillo", true, true, "Mesa 2, elegida para Fair Play"]);
        await t.p.selectOption("#res-2", "3");
        igual("al elegir que ganan negras (que no aplica), la banda lo dice: no aplica, la mesa queda sin efecto", await t.p.$eval(mesa2 + " .cam-fp-banda", (b) => [b.dataset.tipo, /NO APLICA \(se revisó en la ronda 1\)\. La mesa queda sin efecto/.test(b.textContent)]), ["no-aplica", true]);
        await t.p.selectOption("#res-2", "1");
        igual("y si ganan blancas: «retén a …»", await t.p.$eval(mesa2 + " .cam-fp-banda", (b) => [b.dataset.tipo, /retén a .* \(blancas\)/.test(b.textContent)]), ["retener", true]);
        igual("la banda dorada da 4,5 o más", await t.p.evaluate(CONTRASTE, ".cam-fp-banda"), []);
        igual("y sin errores en la tablet", t.errores, []);
        await t.ctx.close();
    } finally {
        await browser.close();
    }
    console.log(fallos ? "\n" + fallos + " fallo(s)." : "\nTodo bien.");
    process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
