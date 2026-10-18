/* Comprueba entreno/estilo.html (la prueba de estilo) en un navegador de verdad.
 *
 * La medición la comprueba herramientas/verificar-estilo-perfil.js sin
 * navegador; acá va lo que solo se rompe mirando la pantalla:
 *
 *   1. Sin sesión, al login.
 *   2. Con sesión: la prueba arranca, el tablero dibuja la posición, «Siguiente»
 *      no deja pasar sin la jugada Y la seguridad, y una persona que contesta
 *      siempre lo mismo termina entre 34 y 58 posiciones (32 y los dos
 *      controles, y hasta 24 más).
 *   3. «Cómo juegas» no se manda sin el ritmo y el estudio; con ellos, sale el
 *      resultado: los cuatro ejes con su etiqueta y su margen escrito, y las tres
 *      recomendaciones con su porqué y su enlace a Aperturas y celadas.
 *      Lo que ve su profe (estilo_opiniones) entra en su eje y lo dice.
 *      «Agregar a Mi repertorio» guarda la línea recomendada, con su color,
 *      a su nombre, y lo dice.
 *      «Bajar la ficha en PDF» baja un PDF de verdad, con la marca de agua.
 *   4. Lo que se guarda en estilo_pruebas: a nombre del alumno de la sesión,
 *      con todas las respuestas (las dos de control marcadas), el contexto y
 *      la recomendación que se mostró; la hora NO la manda el navegador.
 *   5. Con usuarios de Lichess: baja sus partidas y las revisa con el motor
 *      mientras contesta (motor y Lichess de mentira), y los momentos hallados
 *      se guardan con la prueba.
 *   5b. La versión corta: con menos de 1200 en línea se sugiere, termina
 *      entre 26 y 34 posiciones, se guarda con su versión y recomienda nivel 1.
 *   6. Contestando por el cuadro de comandos (Modo Adaptado): «A muy seguro»
 *      anota y pasa a la siguiente.
 *   7. Informes, «Sus aperturas»: el profe ve el estilo de su alumno y lo que
 *      se le recomendó.
 *
 * Uso:  python3 -m http.server 8777 && node herramientas/verificar-estilo-pagina.js
 */
const fs = require("fs");
const { chromium } = require("./lib/playwright-con-sesion");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

let fallos = 0;
function ok(nombre, cond, detalle) {
  if (cond) { console.log("  ✓ " + nombre); return; }
  fallos += 1;
  console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : ""));
}

/* El doble de Supabase. Los filtros se anotan en el RESOLVER, y filtra de
 * verdad: estilo_pruebas devuelve solo las filas del alumno pedido. */
function clienteFalso(o) {
  return `
(function () {
  var O = ${JSON.stringify(o)};
  window.__escrituras = [];
  window.__pruebas = O.pruebas || [];
  function tabla(nombre) {
    var f = {};
    var api = {
      select: function () { return api; },
      eq: function (c, v) { f[c] = v; return api; },
      order: function () { return api; },
      range: function () { return api; },
      in: function () { return api; },
      maybeSingle: function () { return api.then(function (r) { return { data: (r.data || [])[0] || null, error: r.error }; }); },
      single: function () { return api.maybeSingle(); },
      insert: function (fila) {
        window.__escrituras.push({ tabla: nombre, fila: fila });
        var guardada = Object.assign({ id: "p-nueva", created_at: "2026-10-17T20:00:00Z" }, fila);
        if (nombre === "estilo_pruebas") window.__pruebas.unshift(guardada);
        var r = { data: [guardada], error: null };
        return { select: function () { return { maybeSingle: function () { return Promise.resolve({ data: guardada, error: null }); } }; }, then: function (ok) { return Promise.resolve(r).then(ok); } };
      },
      upsert: function (fila) { window.__escrituras.push({ tabla: nombre, fila: fila }); return Promise.resolve({ error: null }); },
      update: function () { return api; },
      then: function (ok, mal) {
        var data = [];
        if (nombre === "profiles") data = [{ id: f.id || O.yo, full_name: "Alumna de prueba", role: O.rol || "alumno", is_admin: false }];
        if (nombre === "analisis_partidas_alumno" && O.cuentas && f.alumno_id === O.alumno) data = [O.cuentas];
        if (nombre === "estilo_pruebas") data = window.__pruebas.filter(function (p) { return p.alumno_id === f.alumno_id; });
        if (nombre === "estilo_opiniones") data = (O.opiniones || []).filter(function (x) { return x.alumno_id === f.alumno_id; });
        if (nombre === "estilo_seguimiento") data = (O.seguimiento || []).filter(function (x) { return x.alumno_id === f.alumno_id; });
        return Promise.resolve({ data: data, error: null }).then(ok, mal);
      },
    };
    return api;
  }
  window.sb = {
    auth: {
      getSession: function () { return Promise.resolve({ data: { session: O.yo ? { user: { id: O.yo }, access_token: "x" } : null } }); },
      getUser: function () { return Promise.resolve({ data: { user: O.yo ? { id: O.yo } : null } }); },
      onAuthStateChange: function () { return { data: { subscription: { unsubscribe: function () {} } } }; },
    },
    from: tabla,
    rpc: function () { return Promise.resolve({ data: null, error: null }); },
    channel: function () { var c = { on: function () { return c; }, subscribe: function () { return c; } }; return c; },
    removeChannel: function () {},
  };
})();
`;
}

/* Partidas de Lichess de mentira: la misma apertura tres veces, con la
 * alumna de blancas. */
const PGN = [1, 2, 3].map((i) => `[Event "Rated blitz game"]
[Site "https://lichess.org/abc${i}"]
[White "alumna1"]
[Black "rival${i}"]
[Result "1-0"]
[UTCDate "2026.09.0${i}"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Na5 10. Bc2 c5 11. d4 Qc7 12. Nbd2 cxd4 13. cxd4 Nc6 14. Nb3 a5 15. Be3 a4 16. Nbd2 Bd7 17. Rc1 Qb7 18. Qe2 Rfe8 1-0
`).join("\n");

async function abrir(browser, ruta, cliente, extra) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: cliente }));
  await ctx.route("**/lichess.org/api/games/user/**", (r) => r.fulfill({ status: 200, contentType: "application/x-chess-pgn", body: PGN }));
  if (extra && extra.adaptado) await ctx.addInitScript(() => { try { localStorage.setItem("oscarBlindMode_v1", "1"); } catch (e) {} });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errores.push("console: " + m.text()); });
  if (extra && extra.motor) {
    // El motor de mentira: todas las jugadas legales con la misma
    // evaluación (así la de la partida siempre está entre las buenas). Lo
    // que se mide es que la página lo llame y guarde lo que halla, no el motor.
    await page.addInitScript(() => {
      window.__llamadasMotor = 0;
      const poner = () => {
        if (!window.EstiloPartidas) return setTimeout(poner, 20);
        window.EstiloPartidas.evaluarConSharedEngine = (fen) => {
          window.__llamadasMotor++;
          const c = new Chess(fen);
          const ms = c.moves({ verbose: true });
          return Promise.resolve(ms.map((m) => {
            const u = m.from + m.to + (m.promotion || "");
            const g = new Chess(fen); g.move(m);
            const r = g.moves({ verbose: true })[0];
            return { uci: u, score: 10, pv: [u].concat(r ? [r.from + r.to + (r.promotion || "")] : []) };
          }));
        };
      };
      poner();
    });
  }
  await page.goto(BASE + ruta, { waitUntil: "domcontentloaded" });
  return { page, ctx, errores };
}

/* Contesta la prueba entera con los botones; devuelve cuántas posiciones vio. */
async function contestarTodo(page) {
  let n = 0;
  for (let i = 0; i < 60; i++) {
    if (await page.locator("#contexto-view:not(.hidden)").count()) break;
    await page.click('#q-options button[data-eleccion="a"]');
    await page.click('#q-seguridad button[data-seguridad="3"]');
    await page.click("#next-btn");
    n++;
  }
  return n;
}

async function llenarContexto(page) {
  await page.check('input[name="ritmo"][value="rapidas"]');
  await page.check('input[name="estudio"][value="medio"]');
  await page.fill("#ctx-elo", "1500");
  await page.selectOption("#ctx-blancas", "espanola-cerrada");
}

async function main() {
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });

  console.log("\n=== Sin sesión ===");
  {
    const { page, ctx } = await abrir(browser, "/entreno/estilo.html", clienteFalso({ yo: null }));
    await page.waitForURL(/login\.html/, { timeout: 8000 }).catch(() => {});
    ok("sin sesión manda a login.html", /login\.html/.test(page.url()), page.url());
    await ctx.close();
  }

  console.log("\n=== La prueba entera, con los botones ===");
  {
    // Su profe ya dijo que en «material o iniciativa» la ve dar material; la
    // opinión sobre otra alumna no se tiene que contar.
    const opiniones = [{ alumno_id: "u-1", profesor_id: "p-1", eje: "material", opinion: -1 }, { alumno_id: "u-9", profesor_id: "p-1", eje: "ataque", opinion: 1 }];
    const { page, ctx, errores } = await abrir(browser, "/entreno/estilo.html", clienteFalso({ yo: "u-1", alumno: "u-1", opiniones }));
    await page.waitForSelector("#app:not(.hidden)", { timeout: 15000 });
    ok("sin cuentas en línea no ofrece sumar las partidas", !(await page.locator("#partidas-opcion").isVisible()));
    await page.click("#start-btn");
    await page.waitForSelector("#pregunta-view:not(.hidden)");
    const piezas = await page.$$eval("#q-board .example-sq", (c) => [c.length, c.filter((x) => x.querySelector("span")).length]);
    ok("el tablero dibuja 64 casillas con piezas", piezas[0] === 64 && piezas[1] > 4, JSON.stringify(piezas));
    ok("«Siguiente» empieza apagado", await page.isDisabled("#next-btn"));
    await page.click('#q-options button[data-eleccion="a"]');
    ok("con la jugada sola sigue apagado (falta la seguridad)", await page.isDisabled("#next-btn"));
    const marcadas = await page.$$eval("#q-board [data-square]", (c) => c.filter((x) => x.style.boxShadow).length);
    ok("la jugada elegida se marca en el tablero (salida y llegada)", marcadas === 2, "marcadas: " + marcadas);
    await page.click('#q-seguridad button[data-seguridad="2"]');
    ok("con la jugada y la seguridad se enciende", !(await page.isDisabled("#next-btn")));
    await page.click("#next-btn");
    ok("pasa a la posición 2", /^Posición 2/.test(await page.textContent("#q-counter")), await page.textContent("#q-counter"));
    const n = 1 + await contestarTodo(page);
    ok("termina entre 34 y 58 posiciones", n >= 34 && n <= 58, "vio " + n);

    await page.click("#ctx-btn");
    ok("sin ritmo ni estudio no se manda: dice qué falta", (await page.locator("#ctx-error").isVisible()) && /ritmo/.test(await page.textContent("#ctx-error")));
    await llenarContexto(page);
    await page.click("#ctx-btn");
    await page.waitForSelector("#resultado-view:not(.hidden)", { timeout: 10000 });
    const ejes = await page.$$eval("[data-estilo-perfil] [data-eje]", (f) => f.map((x) => [x.dataset.eje, x.dataset.etiqueta, x.textContent]));
    ok("el resultado trae los cuatro ejes", ejes.length === 4 && ["ataque", "estructura", "cambios", "material"].every((e) => ejes.some((x) => x[0] === e)), JSON.stringify(ejes.map((x) => x[0])));
    ok("cada eje dice su margen escrito («entre X y Y %»)", ejes.every((x) => /entre \d+ y \d+ %/.test(x[2])));
    ok("lo que ve su profe entra en su eje, y lo dice; la opinión sobre otra alumna no",
      ejes.filter((x) => /lo que ve tu profe/.test(x[2])).map((x) => x[0]).join() === "material", JSON.stringify(ejes.map((x) => [x[0], /profe/.test(x[2])])));
    const grupos = await page.$$eval("[data-estilo-recomendacion] [data-grupo]", (f) => f.map((x) => [x.dataset.grupo, !!x.querySelector('a[href*="aperturas.html?linea="]'), x.querySelectorAll("li").length]));
    ok("recomienda con blancas, contra 1.e4 y contra 1.d4, con porqué y enlace", grupos.length === 3 && grupos.every((g) => g[1] && g[2] >= 2), JSON.stringify(grupos));
    await page.click('[data-grupo="e4"] [data-repertorio]');
    await page.waitForFunction(() => /Listo/.test((document.querySelector('[data-grupo="e4"] [data-repertorio] + [role="status"]') || {}).textContent || ""), null, { timeout: 5000 }).catch(() => {});
    const rep = await page.evaluate(() => ({
      esc: window.__escrituras.filter((e) => e.tabla === "repertorio").map((e) => e.fila),
      id: document.querySelector('[data-grupo="e4"] [data-repertorio]').dataset.repertorio,
      dice: document.querySelector('[data-grupo="e4"] [data-repertorio] + [role="status"]').textContent,
    }));
    ok("«Agregar a Mi repertorio» guarda la defensa recomendada contra 1.e4, con negras y a su nombre, y lo dice",
      rep.esc.length === 1 && rep.esc[0].alumno_id === "u-1" && rep.esc[0].color === "b" && rep.esc[0].jugadas[0] === "e4" && rep.esc[0].jugadas.length >= 2 && /Listo/.test(rep.dice),
      JSON.stringify(rep));

    // La ficha en PDF: baja un PDF de verdad, con la marca de agua (que se
    // busca en ../img desde entreno/) y su nombre.
    const [descarga] = await Promise.all([
      page.waitForEvent("download", { timeout: 15000 }),
      page.click("[data-estilo-ficha]"),
    ]);
    const ruta = await descarga.path();
    const pdf = require("fs").readFileSync(ruta).toString("latin1");
    ok("«Bajar la ficha en PDF» baja un PDF con la marca de agua y su nombre",
      pdf.startsWith("%PDF") && /\/SMask/.test(pdf) && /^estilo-de-juego-.*\.pdf$/.test(descarga.suggestedFilename()),
      descarga.suggestedFilename() + " · " + pdf.slice(0, 8));

    // «Por qué»: debajo de cada eje, posiciones de SU prueba, escritas y en
    // un tablero que se abre (js/visor-linea.js).
    const porQue = await page.$$eval("[data-estilo-perfil] [data-eje]", (f) => f.map((x) => {
      const d = x.querySelector("[data-estilo-por-que]");
      return { eje: x.dataset.eje, hay: !!d, textos: d ? [...d.querySelectorAll("[data-ejemplo] > p:first-child")].map((p) => p.textContent) : [] };
    }));
    ok("cada eje trae «Por qué: lo que elegiste», con una o dos posiciones de su prueba",
      porQue.every((x) => x.hay && x.textos.length >= 1 && x.textos.length <= 2), JSON.stringify(porQue.map((x) => [x.eje, x.textos.length])));
    ok("cada una escrita: la que eligió, qué representa, y la otra",
      porQue.every((x) => x.textos.every((t) => /elegiste \S+ —[^—]+— y no \S+ —[^—]+—/.test(t))), porQue.map((x) => x.textos[0]).join(" | "));
    await page.click('[data-eje="ataque"] [data-estilo-por-que] summary');
    await page.click('[data-eje="ataque"] [data-estilo-por-que] [data-ejemplo] button[aria-expanded]');
    await page.waitForFunction(() => document.querySelectorAll('[data-eje="ataque"] [data-ejemplo] .visor-linea .visor-sq').length === 64, null, { timeout: 10000 });
    const visor = await page.evaluate(() => {
      const v = document.querySelector('[data-eje="ataque"] [data-ejemplo] .visor-linea');
      const b = document.querySelector('[data-eje="ataque"] [data-ejemplo] button[aria-expanded]');
      return { titulo: v.querySelector(".visor-titulo").textContent, jugadas: v.querySelectorAll(".visor-jugada").length, abierto: b.getAttribute("aria-expanded"), visible: v.checkVisibility() };
    });
    ok("«Verla en el tablero» abre la posición con su jugada y la línea del motor", visor.visible && visor.abierto === "true" && /^Elegiste /.test(visor.titulo) && visor.jugadas >= 2, JSON.stringify(visor));

    // «Ver una partida modelo»: una partida de maestros con esa apertura,
    // ganada por quien la juega, desde la posición de la apertura.
    await page.click('[data-grupo="blancas"] [data-modelo] button[aria-expanded]');
    await page.waitForFunction(() => document.querySelectorAll('[data-grupo="blancas"] [data-modelo] .visor-linea .visor-sq').length === 64, null, { timeout: 10000 });
    const modelo = await page.evaluate(() => {
      const caja = document.querySelector('[data-grupo="blancas"] [data-modelo]');
      const v = caja.querySelector(".visor-linea");
      const m = window.EstiloModelos[caja.dataset.modelo];
      const linea = window.AperturasLineas.LINEAS.find((l) => l.id === caja.dataset.modelo);
      return { titulo: v.querySelector(".visor-titulo").textContent, jugadas: v.querySelectorAll(".visor-jugada").length, total: m.jugadas.length,
        escrita: v.querySelector(".visor-escrita").textContent, en: linea.jugadas.length, resultado: m.resultado, blancas: m.blancas };
    });
    ok("«Ver una partida modelo» abre la partida entera, con quién la jugó",
      modelo.jugadas === modelo.total && modelo.titulo.startsWith(modelo.blancas + " – "), JSON.stringify(modelo));
    ok("ganada con blancas, y arranca en la posición de la apertura", modelo.resultado === "1-0" && modelo.titulo.includes("ganan las blancas"), JSON.stringify(modelo));
    await page.waitForFunction((n) => new RegExp("^Jugada " + n + " de ").test(document.querySelector('[data-grupo="blancas"] [data-modelo] .visor-escrita').textContent), modelo.en, { timeout: 3000 })
      .then(() => ok("en la jugada donde termina la línea de la apertura", true), () => ok("en la jugada donde termina la línea de la apertura", false, modelo.escrita));

        await page.waitForFunction(() => window.__escrituras.some((e) => e.tabla === "estilo_pruebas"), null, { timeout: 5000 }).catch(() => {});
    const esc = await page.evaluate(() => window.__escrituras.filter((e) => e.tabla === "estilo_pruebas"));
    const fila = esc[0] && esc[0].fila;
    ok("guarda UNA prueba", esc.length === 1, JSON.stringify(esc).slice(0, 200));
    if (fila) {
      ok("a nombre del alumno de la sesión", fila.alumno_id === "u-1");
      ok("con todas las respuestas que dio", fila.respuestas.length === n, fila.respuestas.length + " de " + n);
      ok("con las dos de control marcadas", fila.respuestas.filter((r) => r.control).length === 2);
      ok("cada respuesta con su jugada, su seguridad y su tiempo", fila.respuestas.every((r) => /^[ab]$/.test(r.eleccion) && [1, 2, 3].includes(r.seguridad) && r.ms >= 0));
      ok("con el contexto", fila.contexto.ritmo === "rapidas" && fila.contexto.estudio === "medio" && fila.contexto.elo === 1500 && fila.contexto.actual.blancas === "espanola-cerrada", JSON.stringify(fila.contexto));
      ok("con la recomendación que se mostró", fila.recomendacion && fila.recomendacion.blancas && fila.recomendacion.e4 && fila.recomendacion.d4);
      ok("la hora no la manda el navegador", !("created_at" in fila));
      ok("sin partidas (no tenía cuentas)", fila.partidas === null);
    }
    ok("guardado: lo dice en pantalla", /guardado/.test(await page.textContent("#r-guardado")), await page.textContent("#r-guardado"));
    await page.click("#repeat-btn");
    ok("de vuelta en la portada, muestra «Tu última prueba»", await page.locator("#previo").isVisible());
    ok("sin errores en la consola", errores.length === 0, errores.join("\n      "));
    await ctx.close();
  }

  console.log("\n=== Con sus partidas de Lichess (motor de mentira) ===");
  {
    const { page, ctx, errores } = await abrir(browser, "/entreno/estilo.html",
      clienteFalso({ yo: "u-1", alumno: "u-1", cuentas: { lichess: "alumna1", chesscom: null, elo: { reciente: 1640 } } }), { motor: true });
    await page.waitForSelector("#app:not(.hidden)", { timeout: 15000 });
    ok("ofrece sumar sus partidas, nombrando la cuenta", (await page.locator("#partidas-opcion").isVisible()) && /alumna1/.test(await page.textContent("#partidas-cuentas")));
    await page.click("#start-btn");
    await page.waitForSelector("#pregunta-view:not(.hidden)");
    await contestarTodo(page);
    ok("pone su Elo en línea en «Cómo juegas»", (await page.inputValue("#ctx-elo")) === "1640");
    await llenarContexto(page);
    await page.click("#ctx-btn");
    await page.waitForSelector("#resultado-view:not(.hidden)", { timeout: 70000 });
    await page.waitForFunction(() => window.__escrituras.some((e) => e.tabla === "estilo_pruebas"), null, { timeout: 5000 }).catch(() => {});
    const llamadas = await page.evaluate(() => window.__llamadasMotor);
    ok("revisó sus partidas con el motor", llamadas > 0, "llamadas: " + llamadas + " · " + await page.textContent("#q-partidas"));
    const fila = await page.evaluate(() => (window.__escrituras.find((e) => e.tabla === "estilo_pruebas") || {}).fila);
    ok("guarda los momentos hallados ({eje, primero}), sin las partidas", fila && Array.isArray(fila.partidas) && fila.partidas.length > 0
      && fila.partidas.every((m) => ["ataque", "estructura", "cambios", "material"].includes(m.eje) && typeof m.primero === "boolean" && Object.keys(m).length === 2),
      JSON.stringify(fila && fila.partidas));
    // Sus tres partidas terminan en la jugada 18: ninguna llega a la media
    // jugada 40, así que no hay con qué medir en qué partidas le va mejor.
    ok("con partidas cortas no inventa en qué partidas le va mejor", fila && fila.contexto && !("rendimiento" in fila.contexto), JSON.stringify(fila && fila.contexto));
    ok("sin errores en la consola (con partidas)", errores.length === 0, errores.join("\n      "));
    await ctx.close();
  }

  /* El aviso a su profe a las 5 partidas: al abrir la prueba, el navegador
     del alumno cuenta solo, en segundo plano, cuántas jugó con cada apertura
     recomendada desde su última prueba, y lo guarda (estilo_seguimiento). Si
     ya contó hoy, no vuelve a bajar nada. */
  console.log("\n=== Contar las partidas con la apertura, sin que nadie apriete nada ===");
  {
    const anterior = { id: "p-vieja", alumno_id: "u-1", version: 2, respuestas: [], contexto: {}, partidas: null, created_at: "2026-08-01T15:00:00Z",
      recomendacion: { blancas: { titulo: "Con blancas", principal: { id: "espanola-cerrada", nombre: "Española, variante cerrada", jugadas: ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"], porque: [] } } } };
    const cuentas = { lichess: "alumna1", chesscom: null, elo: { reciente: 1640 } };
    let { page, ctx, errores } = await abrir(browser, "/entreno/estilo.html", clienteFalso({ yo: "u-1", alumno: "u-1", cuentas, pruebas: [anterior] }));
    await page.waitForSelector("#app:not(.hidden)", { timeout: 15000 });
    await page.waitForFunction(() => window.__escrituras.some((e) => e.tabla === "estilo_seguimiento"), null, { timeout: 20000 }).catch(() => {});
    const seg = await page.evaluate(() => window.__escrituras.filter((e) => e.tabla === "estilo_seguimiento").map((e) => e.fila));
    ok("al abrir la prueba cuenta solo y guarda: su prueba, y 3 partidas con la apertura después de ella",
      seg.length === 1 && seg[0].alumno_id === "u-1" && seg[0].prueba_id === "p-vieja" && seg[0].partidas.blancas === 3, JSON.stringify(seg));
    ok("el alumno no marca nada como revisado (eso es de su profe)", seg[0] && !("revisado_at" in seg[0]));
    ok("sin errores (contando)", errores.length === 0, errores.join("\n      "));
    await ctx.close();
    ({ page, ctx, errores } = await abrir(browser, "/entreno/estilo.html", clienteFalso({ yo: "u-1", alumno: "u-1", cuentas, pruebas: [anterior],
      seguimiento: [{ alumno_id: "u-1", prueba_id: "p-vieja", updated_at: new Date(Date.now() - 3600000).toISOString() }] })));
    await page.waitForSelector("#app:not(.hidden)", { timeout: 15000 });
    await page.waitForTimeout(2500);
    ok("si ya contó hace una hora, no vuelve a bajar ni a guardar nada", await page.evaluate(() => window.__escrituras.filter((e) => e.tabla === "estilo_seguimiento").length) === 0);
    await ctx.close();
  }

  console.log("\n=== La versión corta, para quien empieza ===");
  {
    // Con 1150 en línea, la página sugiere la corta.
    const { page, ctx, errores } = await abrir(browser, "/entreno/estilo.html",
      clienteFalso({ yo: "u-1", alumno: "u-1", cuentas: { lichess: null, chesscom: "peque", elo: { reciente: 1150 } } }));
    await page.waitForSelector("#app:not(.hidden)", { timeout: 15000 });
    ok("con menos de 1200 en línea sugiere la corta", await page.isChecked("#forma-corta"));
    await page.uncheck("#usar-partidas").catch(() => {});
    await page.click("#start-btn");
    await page.waitForSelector("#pregunta-view:not(.hidden)");
    const n = await contestarTodo(page);
    ok("termina entre 26 y 34 posiciones", n >= 26 && n <= 34, "vio " + n);
    await llenarContexto(page);
    await page.click("#ctx-btn");
    await page.waitForSelector("#resultado-view:not(.hidden)", { timeout: 10000 });
    await page.waitForFunction(() => window.__escrituras.some((e) => e.tabla === "estilo_pruebas"), null, { timeout: 5000 }).catch(() => {});
    const fila = await page.evaluate(() => (window.__escrituras.find((e) => e.tabla === "estilo_pruebas") || {}).fila);
    ok("se guarda con la versión corta y lo dice el contexto", fila && fila.version === 3 && fila.contexto.inicial === true && fila.respuestas.length === n,
      JSON.stringify(fila && { version: fila.version, contexto: fila.contexto }));
    ok("lo que se le recomienda es de nivel 1", fila && ["blancas", "e4", "d4"].every((g) => fila.recomendacion[g] && fila.recomendacion[g].principal.nivel === 1),
      JSON.stringify(fila && ["blancas", "e4", "d4"].map((g) => fila.recomendacion[g] && [fila.recomendacion[g].principal.id, fila.recomendacion[g].principal.nivel])));
    ok("sin errores en la consola (versión corta)", errores.length === 0, errores.join("\n      "));
    await ctx.close();
  }

  console.log("\n=== Contestando por escrito (Modo Adaptado) ===");
  {
    const { page, ctx, errores } = await abrir(browser, "/entreno/estilo.html", clienteFalso({ yo: "u-1", alumno: "u-1" }), { adaptado: true });
    await page.waitForSelector("#app:not(.hidden)", { timeout: 15000 });
    await page.click("#start-btn");
    await page.waitForSelector("#q-comandos .cc-input", { state: "visible", timeout: 8000 });
    const escribir = async (t) => {
      await page.fill("#q-comandos .cc-input", t);
      await page.press("#q-comandos .cc-input", "Enter");
      await page.waitForTimeout(300);
      return page.evaluate(() => { const m = Array.from(document.querySelectorAll("#q-comandos .cc-msg")).find((x) => x.checkVisibility()); return m ? m.textContent : ""; });
    };
    const antes = await page.textContent("#q-counter");
    const faltan = await escribir("siguiente");
    ok("«siguiente» sin contestar dice qué falta y no pasa", /falta/i.test(faltan) && (await page.textContent("#q-counter")) === antes, faltan);
    const dicho = await escribir("A muy seguro");
    ok("«A muy seguro» anota y pasa a la siguiente", /Anotado: jugada A, muy seguro/.test(dicho) && /^Posición 2/.test(await page.textContent("#q-counter")), dicho);
    const solo = await escribir("b");
    ok("de a una cosa: «b» pide la seguridad", /seguro/.test(solo) && /^Posición 2/.test(await page.textContent("#q-counter")), solo);
    await escribir("me da igual");
    ok("y «me da igual» la completa y pasa", /^Posición 3/.test(await page.textContent("#q-counter")));
    ok("sin errores en la consola (por escrito)", errores.length === 0, errores.join("\n      "));
    await ctx.close();
  }

  await browser.close();
  if (fallos) { console.log(`\n${fallos} comprobaciones fallaron.`); process.exit(1); }
  console.log("\nTodo en orden.");
}

main().catch((e) => { console.error(e); process.exit(2); });
