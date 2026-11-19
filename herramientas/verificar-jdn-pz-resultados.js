/* «Resultados U12», «Resultados U20» e «Inscritos» de la Eliminatoria JDN de
 * Pérez Zeledón (jdn-pz-2026.html; js/jdn-pz-resultados.js y
 * js/jdn-pz-inscritos.js), con los datos de Pareo Integral como en el
 * Centroamericano (js/torneo-pareo-datos.js y js/centroamericano-vivo.js).
 *
 * Con un doble de la base que filtra de verdad (pareo_organizadores y
 * pareo_publicados, con ilike y gte como PostgREST). Lo que comprueba:
 *   - EL HTML: las fichas «Resultados U12/U20» abren su ventana de la página
 *     (no la página de Pareo encima), está «Inscritos» y «Busca a tu
 *     jugador», y la página lee Pareo (fuente "pareo"), no chess-results;
 *   - «RESULTADOS U12» con la ronda 2 a medias: cómo va (ronda, partidas
 *     terminadas, jugadores), el pareo mesa por mesa con la categoría, el
 *     Elo y los puntos, el color escrito; el buscador filtra las mesas; la
 *     clasificación va una tabla por categoría, en el orden de Pareo, con el
 *     puesto en la categoría y el general; tocar un nombre lo busca en «Busca
 *     a tu jugador» y cierra la ventana;
 *   - «RESULTADOS U20» toma el torneo «U20-U16» y, antes de la ronda 1, dice
 *     que el pareo no está y muestra el orden inicial;
 *   - un torneo de la misma organización que no dice «JDN CCDRPZ» no entra;
 *   - «INSCRITOS»: cuántos aprobados por torneo, el filtro por categoría con
 *     sus cuentas, la foto de quien la tiene (lista.json) y las iniciales de
 *     quien no, SIN pedir la foto que no existe; ordenar por Elo; «Aprobado»;
 *   - sin torneos publicados, las ventanas lo dicen;
 *   - LO DEL TACHO (ver «Lo del Tacho, también en la Eliminatoria JDN de
 *     PZ»): «En vivo» en «El torneo» (js/torneo-en-vivo.js, con un doble de
 *     los canales que hace de cámara): «Próximamente», la partida de la
 *     cámara cuando transmite, con el botón azul de ADAPZ, y de vuelta a
 *     «Próximamente»; y el certificado y los textos sin nada del
 *     Centroamericano (lo que escribe y dibuja el lienzo del certificado);
 *   - en el celular no hay scroll de costado, y no hay errores.
 *
 * Ver «Los resultados U12 y U20, como en el Centroamericano» y «Los inscritos
 * de la Eliminatoria JDN de PZ, con su foto» en docs/decisiones/juegos-y-torneos.md.
 *
 *   python3 -m http.server 8777     (desde la raíz del sitio)
 *   node herramientas/verificar-jdn-pz-resultados.js
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const RAIZ = path.join(__dirname, "..");

let fallos = 0;
function ok(nombre, cond, detalle) {
  console.log((cond ? "  ✓ " : "  ✗ ") + nombre + (cond || !detalle ? "" : " — " + detalle));
  if (!cond) fallos++;
}

// La base de mentira: filas de verdad, y la consulta filtra como PostgREST.
function doble(datos) {
  return `(function(){
  const D = ${JSON.stringify(datos)};
  window.__dobleDatos = D;
  window.__pedidos = [];
  // Los canales de Broadcast: la prueba hace de cámara con __emitir, y ve
  // qué se pidió en __enviados.
  window.__canales = new Map();
  window.__enviados = [];
  window.__emitir = (nombre, payload) => { const c = window.__canales.get(nombre); if (c) c.oyentes.forEach((f) => f({ payload })); };
  window.sb = { channel(nombre) {
    const c = { oyentes: [], on(tipo, filtro, f) { if (filtro.event === "estado") c.oyentes.push(f); return c; },
      subscribe(cb) { setTimeout(() => cb("SUBSCRIBED"), 0); return c; }, send(m) { window.__enviados.push(nombre + ": " + m.event); return Promise.resolve(); } };
    window.__canales.set(nombre, c);
    return c;
  }, removeChannel(c) { for (const [k, v] of window.__canales) if (v === c) window.__canales.delete(k); }, from(tabla) {
    const filas = (D[tabla] || []).slice();
    const f = [];
    let orden = null;
    // «alias:datos->>campo», como PostgREST: un campo de los datos, en texto.
    let alias = [];
    const q = {
      select(cols) { window.__pedidos.push(tabla + ": " + cols); alias = [...String(cols || "").matchAll(/(\\w+):datos->>(\\w+)/g)].map((m) => [m[1], m[2]]); return q; },
      eq(c, v) { f.push((r) => r[c] === v); return q; },
      in(c, vs) { f.push((r) => vs.includes(r[c])); return q; },
      gte(c, v) { f.push((r) => String(r[c]) >= String(v)); return q; },
      // «%texto%», sin distinguir mayúsculas.
      ilike(c, patron) { const x = patron.toLowerCase().replace(/^%|%$/g, ""); f.push((r) => String(r[c]).toLowerCase().includes(x)); return q; },
      order(c, o) { orden = [c, o && o.ascending === false ? -1 : 1]; return q; },
      range() { return q; },
      then(okf, ko) {
        let out = filas.filter((r) => f.every((g) => g(r)));
        if (alias.length) out = out.map((r) => { const x = Object.assign({}, r); alias.forEach(([a, c]) => { const v = r.datos && r.datos[c]; x[a] = v == null ? null : String(v); }); return x; });
        if (orden) out.sort((a, b) => (a[orden[0]] < b[orden[0]] ? -1 : 1) * orden[1]);
        return Promise.resolve({ data: out, error: null }).then(okf, ko);
      },
    };
    return q;
  } };
})();`;
}

const ORGS = [{ id: "org-ai", nombre: "Ajedrez Integral", verificado: true }];
const jug = (id, nombre, categoria, elo) => ({ id, nombre, categoria, elo, titulo: "", fed: "", institucion: "ADAPZ" });
// U12: la ronda 1 completa y la 2 a medias (como lo publica Pareo, con su resumen).
const U12 = {
  id: "11111111-1111-4111-8111-111111111111", nombre: "Eliminatoria Cantonal JDN CCDRPZ – U12", organizador_id: "org-ai",
  creado: "2026-11-12T04:31:54Z", actualizado: "2026-11-22T16:30:00Z",
  datos: {
    rondasTotales: 5,
    jugadores: [jug("a", "Ulcigrai Ramírez, Giordano", "U12 Absoluto", 1455), jug("b", "Jiménez Azofeifa, Lía", "U12 Femenino", 1444),
      jug("c", "Quesada Aguero, Samuel", "U12 Absoluto", 0), jug("d", "Zuñiga Arias, Yariela Sofia", "U12 Femenino", 0)],
    rondas: [{ mesas: [{ b: "a", n: "c", r: "1-0" }, { b: "b", n: "d", r: "=" }], ausencias: {} },
      { mesas: [{ b: "d", n: "a", r: null }, { b: "c", n: "b", r: "0-1" }], ausencias: {} }],
    resumen: [["a", 1, 1], ["b", 2, 0.5], ["d", 3, 0.5], ["c", 4, 0]].map(([id, puesto, puntos]) => ({ id, puesto, puntos, rondas: 1 })),
  },
};
const U20 = {
  id: "22222222-2222-4222-8222-222222222222", nombre: "Eliminatoria Cantonal JDN CCDRPZ – U20-U16", organizador_id: "org-ai",
  creado: "2026-11-12T04:32:06Z", actualizado: "2026-11-12T04:32:06Z",
  datos: { rondasTotales: 5, jugadores: [jug("e", "Sequeira Solís, Shane Stevens", "U20 Absoluto", 1694), // Inventado: nadie de la eliminatoria se llama así, y no tiene foto.
    jug("f", "Mora Vargas, Tomás", "U16 Absoluto", 0)], rondas: [] },
};
// De la misma organización, pero no es de la eliminatoria: no entra.
const OTRO = { id: "33333333-3333-4333-8333-333333333333", nombre: "Tacho Chess U12", organizador_id: "org-ai", creado: "2026-11-13T19:00:00Z",
  datos: { jugadores: [jug("z", "Intruso, Pepe", "Primer grado", 0)], rondas: [] } };

async function abrir(nav, publicados, hash, ancho, reloj) {
  const ctx = await nav.newContext({ viewport: { width: ancho || 1280, height: 900 }, serviceWorkers: "block" });
  await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ contentType: "application/javascript", body: doble({ pareo_organizadores: ORGS, pareo_publicados: publicados }) }));
  await ctx.route("**/js/vendor/supabase.js", (r) => r.fulfill({ contentType: "application/javascript", body: "" }));
  await ctx.route("**/functions/v1/**", (r) => r.fulfill({ contentType: "application/json", body: "{}" }));
  const p = await ctx.newPage();
  const errores = [], fotos = [];
  p.on("pageerror", (e) => errores.push(String(e)));
  p.on("request", (q) => { if (/\/jugadores\//.test(q.url())) fotos.push(q.url().split("/").pop()); });
  if (reloj) await p.clock.install({ time: new Date("2026-11-22T10:40:00-06:00") });
  else await p.clock.setFixedTime(new Date("2026-11-22T10:40:00-06:00"));
  await p.goto(BASE + "/jdn-pz-2026.html" + (hash || ""), { waitUntil: "load" });
  return { ctx, p, errores, fotos };
}
const texto = (p, sel) => p.evaluate((s) => [...document.querySelectorAll(s)].map((e) => e.innerText.replace(/\s+/g, " ").trim()), sel);

(async () => {
  console.log("jdn-pz-2026.html, leída");
  const html = fs.readFileSync(path.join(RAIZ, "jdn-pz-2026.html"), "utf8");
  const cfg = fs.readFileSync(path.join(RAIZ, "js/jdn-pz.js"), "utf8");
  ok("«Resultados U12» y «Resultados U20» abren su ventana de la página", /<a href="#resultados-u12" id="ficha-resultados-u12"/.test(html) && /<a href="#resultados-u20" id="ficha-resultados-u20"/.test(html)
    && /<dialog id="resultados-u12"/.test(html) && /<dialog id="resultados-u20"/.test(html));
  ok("está la ficha «Inscritos» con su ventana, y «Busca a tu jugador»", /<a href="#inscritos"/.test(html) && /<dialog id="inscritos"/.test(html) && /id="buscador-nombre"/.test(html));
  ok("los datos son de Pareo Integral (fuente \"pareo\", los torneos «JDN CCDRPZ»), no de chess-results",
    /fuente: "pareo"/.test(cfg) && /pareo: \{ nombre: "JDN CCDRPZ"/.test(cfg) && /js\/torneo-pareo-datos\.js/.test(html) && !/chess-results\.com/.test(html));
  ok("nada lleva a la lista de torneos de Pareo (trae los de otros)", !html.includes('href="torneos-pareo.html"'));
  ok("carga «En vivo» (js/torneo-en-vivo.js, la misma copia del Tacho) con el botón azul de ADAPZ",
    /<script src="js\/torneo-en-vivo\.js"><\/script>/.test(html) && /botonVivo: "pz-boton"/.test(cfg));
  ok("lleva sus textos y la cara de su certificado, sin nada del Centroamericano",
    /textos: \{/.test(cfg) && /diploma: \{/.test(cfg) && /evento: "Eliminatoria Cantonal JDN · Pérez Zeledón 2026"/.test(cfg) && !/Centroamericano 2026|centroamericano-2026\//.test(cfg));

  const nav = await chromium.launch(fs.existsSync(CHROME) ? { executablePath: CHROME } : {});
  try {
    console.log("\n«Resultados U12», con la ronda 2 a medias");
    const x = await abrir(nav, [U12, U20, OTRO]);
    await x.p.click("#ficha-resultados-u12");
    await x.p.waitForFunction(() => document.querySelector("#resultados-u12-contenido .cac-cat-mesa"), null, { timeout: 8000 }).catch(() => {});
    const est = await x.p.evaluate(() => ({ abierta: document.getElementById("resultados-u12").open, estado: (document.querySelector("#resultados-u12-contenido [role=status]") || {}).textContent || "",
      botones: [...document.querySelectorAll("#resultados-u12-contenido .cac-modalidad-boton")].map((b) => b.textContent + "=" + b.getAttribute("aria-pressed")) }));
    ok("la ficha abre la ventana de la página, con cómo va la ronda", est.abierta && /^Ronda 2 de 5: 1 de 2 partidas terminadas · 4 jugadores\. Leído en Pareo Integral: .+ [ap]\. m\.$/.test(est.estado), JSON.stringify(est));
    ok("empieza en «Pareo de la ronda», con el par de botones del Centroamericano", JSON.stringify(est.botones) === JSON.stringify(["Pareo de la ronda=true", "Clasificación=false"]), JSON.stringify(est.botones));
    const mesas = await texto(x.p, "#resultados-u12-contenido .cac-cat-mesa");
    ok("una tarjeta por mesa: blancas y negras escritas, con su categoría, su Elo y sus puntos, y el resultado o que se juega",
      mesas.length === 2 && /^Mesa 1 Blancas: ♔ Zuñiga Arias, Yariela Sofia U12 Femenino · ½ pts — Todavía se juega\. Negras: ♚ Ulcigrai Ramírez, Giordano U12 Absoluto · Elo 1455 · 1 pts$/.test(mesas[0])
      && /^Mesa 2 Blancas: ♔ Quesada Aguero, Samuel U12 Absoluto · 0 pts 0 - 1 Negras: ♚ Jiménez Azofeifa, Lía U12 Femenino · Elo 1444 · ½ pts$/.test(mesas[1]), JSON.stringify(mesas));
    await x.p.fill("#resultados-u12-contenido input[type=search]", "lia");
    ok("el buscador deja solo las mesas de quien se busca (sin tildes)", (await texto(x.p, "#resultados-u12-contenido .cac-cat-mesa")).length === 1);
    await x.p.fill("#resultados-u12-contenido input[type=search]", "");
    await x.p.click('#resultados-u12-contenido .cac-modalidad-boton[data-vista="clasificacion"]');
    const cl = await x.p.evaluate(() => ({ titulos: [...document.querySelectorAll("#resultados-u12-contenido h3")].map((h) => h.textContent),
      cabeza: [...document.querySelectorAll("#resultados-u12-contenido table")[0].querySelectorAll("th[scope=col]")].map((t) => t.textContent),
      filas: [...document.querySelectorAll("#resultados-u12-contenido tbody tr")].map((tr) => tr.innerText.replace(/\s+/g, " ").trim()) }));
    ok("la clasificación, una tabla por categoría en el orden de las categorías", JSON.stringify(cl.titulos) === JSON.stringify(["U12 Absoluto · 2 jugadores", "U12 Femenino · 2 jugadores"]), JSON.stringify(cl.titulos));
    ok("con el puesto en la categoría, el Elo, los puntos de las rondas completas y el puesto general, en el orden de Pareo",
      JSON.stringify(cl.cabeza) === JSON.stringify(["Puesto", "Jugador", "Elo", "Puntos", "Puesto general"])
      && JSON.stringify(cl.filas) === JSON.stringify(["1 Ulcigrai Ramírez, Giordano 1455 1 1", "2 Quesada Aguero, Samuel — 0 4", "1 Jiménez Azofeifa, Lía 1444 ½ 2", "2 Zuñiga Arias, Yariela Sofia — ½ 3"]), JSON.stringify(cl));
    await x.p.click('#resultados-u12-contenido tbody .cac-cat-jugador >> text="Quesada Aguero, Samuel"');
    await x.p.waitForTimeout(400);
    const busca = await x.p.evaluate(() => ({ abierta: document.getElementById("resultados-u12").open, valor: document.getElementById("buscador-nombre").value,
      tarjeta: document.getElementById("buscador-resultados").innerText.replace(/\s+/g, " ") }));
    ok("tocar un nombre cierra la ventana y lo busca en «Busca a tu jugador»", !busca.abierta && busca.valor === "Quesada Aguero, Samuel" && /Quesada Aguero, Samuel/.test(busca.tarjeta), JSON.stringify(busca).slice(0, 300));

    console.log("\n«Resultados U20», antes de la ronda 1");
    await x.p.click("#ficha-resultados-u20");
    await x.p.waitForFunction(() => document.querySelector("#resultados-u20-contenido table"), null, { timeout: 5000 }).catch(() => {});
    const u20 = await x.p.evaluate(() => ({ estado: (document.querySelector("#resultados-u20-contenido [role=status]") || {}).textContent || "",
      titulos: [...document.querySelectorAll("#resultados-u20-contenido h3")].map((h) => h.textContent),
      cabeza: [...document.querySelectorAll("#resultados-u20-contenido th[scope=col]")].map((t) => t.textContent).slice(0, 4),
      pareo: document.querySelector('#resultados-u20-contenido .cac-modalidad-boton[data-vista="clasificacion"]').getAttribute("aria-pressed") }));
    ok("toma el torneo «U20-U16»: dice que el pareo todavía no sale y empieza en la clasificación",
      /^2 jugadores aprobados\. El pareo de la ronda 1 sale en cuanto lo publique el árbitro\./.test(u20.estado) && u20.pareo === "true", JSON.stringify(u20));
    ok("con la U16 antes que la U20 y el número inicial (todavía no hay puesto)", JSON.stringify(u20.titulos) === JSON.stringify(["U16 Absoluto · 1 jugador", "U20 Absoluto · 1 jugador"])
      && JSON.stringify(u20.cabeza) === JSON.stringify(["N.º inicial", "Jugador", "Elo", "Puntos"]), JSON.stringify(u20));
    await x.p.click('#resultados-u20-contenido .cac-modalidad-boton[data-vista="pareo"]');
    ok("y su «Pareo de la ronda» lo dice", /El pareo de la ronda 1 todavía no está publicado\./.test((await texto(x.p, "#resultados-u20-contenido .mt-4"))[0] || ""));
    await x.p.keyboard.press("Escape");

    console.log("\n«Inscritos»");
    await x.p.click('a.cac-ficha[href="#inscritos"]');
    await x.p.waitForFunction(() => document.querySelector("#inscritos .jdn-inscrito"), null, { timeout: 5000 }).catch(() => {});
    await x.p.waitForTimeout(300);
    const ins = await x.p.evaluate(() => ({ resumen: (document.querySelector("#inscritos-contenido [role=status]") || {}).textContent || "",
      filtros: [...document.querySelectorAll("#inscritos-contenido .cac-modalidad-boton")].map((b) => b.textContent + "=" + b.getAttribute("aria-pressed")),
      nombres: [...document.querySelectorAll("#inscritos .jdn-inscrito-nombre")].map((n) => n.textContent),
      listos: document.querySelectorAll("#inscritos .jdn-inscrito-listo").length,
      giordano: (() => { const b = [...document.querySelectorAll("#inscritos .jdn-inscrito")].find((x) => /Giordano/.test(x.textContent)); const i = b && b.querySelector("img"); return i ? i.getAttribute("src") : null; })(),
      samuel: (() => { const b = [...document.querySelectorAll("#inscritos .jdn-inscrito")].find((x) => /Tomás Mora/.test(x.textContent)); return b ? [!!b.querySelector("img"), b.querySelector(".jdn-inscrito-sin-foto").textContent] : null; })() }));
    ok("cuántos aprobados y listos, por torneo (el torneo que no es de la eliminatoria no cuenta)",
      ins.resumen === "6 jugadores aprobados y listos para jugar: 4 en el torneo U12 y 2 en el U20 (con la U16)." && !ins.nombres.some((n) => /Pepe/.test(n)), ins.resumen);
    ok("el filtro por categoría, con sus cuentas, empieza en «Todos»",
      JSON.stringify(ins.filtros) === JSON.stringify(["Todos (6)=true", "U12 Absoluto (2)=false", "U12 Femenino (2)=false", "U16 Absoluto (1)=false", "U20 Absoluto (1)=false"]), JSON.stringify(ins.filtros));
    ok("por nombre, con el nombre primero y las mayúsculas arregladas, y todos «Aprobado · listo para jugar»",
      JSON.stringify(ins.nombres) === JSON.stringify(["Giordano Ulcigrai Ramírez", "Lía Jiménez Azofeifa", "Samuel Quesada Aguero", "Shane Stevens Sequeira Solís", "Tomás Mora Vargas", "Yariela Sofia Zuñiga Arias"]) && ins.listos === 6, JSON.stringify(ins.nombres));
    ok("quien tiene foto la lleva; quien no, sus iniciales", ins.giordano === "img/jdn-pz-2026/jugadores/ulcigrai-ramirez-giordano.jpg" && JSON.stringify(ins.samuel) === JSON.stringify([false, "TM"]), JSON.stringify([ins.giordano, ins.samuel]));
    ok("no se pide la foto de quien no la tiene (sin 404)", x.fotos.includes("lista.json") && !x.fotos.includes("mora-vargas-tomas.jpg"), JSON.stringify(x.fotos));
    await x.p.click('#inscritos-contenido .cac-modalidad-boton[data-grupo="U12 Femenino"]');
    ok("el filtro deja solo esa categoría", JSON.stringify(await texto(x.p, "#inscritos .jdn-inscrito-nombre")) === JSON.stringify(["Lía Jiménez Azofeifa", "Yariela Sofia Zuñiga Arias"]));
    await x.p.click('#inscritos-contenido .cac-modalidad-boton[data-grupo=""]');
    await x.p.selectOption("#inscritos-contenido select", "elo");
    ok("ordenar por Elo pone primero al de más Elo", (await texto(x.p, "#inscritos .jdn-inscrito-nombre")).slice(0, 2).join("|") === "Shane Stevens Sequeira Solís|Giordano Ulcigrai Ramírez");
    ok("sin errores en la página", !x.errores.length, x.errores.join(" | "));
    await x.ctx.close();

    console.log("\n«En vivo», con la cámara de Notara");
    {
      const r = await abrir(nav, [U12, U20, OTRO], "", 1280, true);
      await r.p.waitForFunction(() => document.getElementById("hoy-vivo"), null, { timeout: 8000 }).catch(() => {});
      await r.p.waitForTimeout(300);
      const vivo = () => r.p.evaluate(() => { const z = document.getElementById("hoy-vivo"); return z ? { dentro: !!z.closest("#hoy"), visible: z.checkVisibility(), estado: z.dataset.estado, texto: z.innerText.replace(/\s+/g, " ").trim(),
        enlaces: [...z.querySelectorAll("a")].map((a) => [a.getAttribute("href"), a.textContent.trim(), a.dataset.ventana || "", a.checkVisibility(), getComputedStyle(a).backgroundColor, getComputedStyle(a).color]) } : null; });
      let v = await vivo();
      ok("sin cámaras, en «El torneo» dice «En vivo: próximamente»",
        v && v.dentro && v.visible && v.estado === "pronto" && /En vivo: próximamente/.test(v.texto) && !v.enlaces.length && !(await r.p.evaluate(() => window.__canales.size)), JSON.stringify(v));
      ok("pregunta liviano por las cámaras (solo el código, sin los datos del torneo)",
        (await r.p.evaluate(() => window.__pedidos)).includes("pareo_publicados: id, camaras:datos->>camaras"), JSON.stringify(await r.p.evaluate(() => window.__pedidos)));
      await r.p.evaluate(() => { window.__dobleDatos.pareo_publicados[0].datos.camaras = "abcd2345"; window.__dobleDatos.pareo_publicados[2].datos.camaras = "zzzz9999"; });
      await r.p.clock.fastForward(61000);
      await r.p.waitForTimeout(300);
      const enviados = await r.p.evaluate(() => window.__enviados);
      ok("al conectar las cámaras en Pareo, al minuto escucha el canal del U12 y le pide la partida (no el del torneo ajeno)",
        enviados.includes("tablero-vivo-abcd2345: pedir") && !enviados.some((e) => /zzzz9999/.test(e)) && (await vivo()).estado === "pronto", JSON.stringify(enviados));
      await r.p.evaluate((id) => window.__emitir("tablero-vivo-abcd2345", { v: 1, pgn: "1. d4", torneo: id, mesa: 1, blancas: "Zuñiga Arias, Yariela Sofia", negras: "Ulcigrai Ramírez, Giordano", t: Date.now() }), U12.id);
      await r.p.waitForTimeout(150);
      v = await vivo();
      ok("cuando la cámara transmite, sale esa partida y «Ver la partida en vivo» abre tablero-vivo.html encima, en esa mesa",
        v.estado === "vivo" && /En vivo ahora Mesa 1: Zuñiga Arias, Yariela Sofia – Ulcigrai Ramírez, Giordano/.test(v.texto)
        && JSON.stringify(v.enlaces.map((e) => e.slice(0, 4))) === JSON.stringify([["tablero-vivo.html#abcd2345&t=" + U12.id + "&m=1", "Ver la partida en vivo →", "En vivo: Mesa 1", true]]), JSON.stringify(v));
      ok("y el botón va en el azul de ADAPZ (#1D64B0) con letra blanca", v.enlaces[0] && v.enlaces[0][4] === "rgb(29, 100, 176)" && v.enlaces[0][5] === "rgb(255, 255, 255)", JSON.stringify(v.enlaces));
      await r.p.clock.fastForward(61000);
      await r.p.waitForTimeout(300);
      ok("si la cámara deja de transmitir, vuelve a «Próximamente»", (await vivo()).estado === "pronto", JSON.stringify(await vivo()));

      console.log("\nEl certificado y los textos, sin el Centroamericano");
      const cert = await r.p.evaluate(async () => {
        const V = window.CentroamericanoVivo, T = window.CentroamericanoTablas;
        const x = V.jugadores().find((j) => /Ulcigrai/.test(j.j.nombre));
        const escritos = [], dibujos = [];
        const fill = CanvasRenderingContext2D.prototype.fillText, draw = CanvasRenderingContext2D.prototype.drawImage;
        CanvasRenderingContext2D.prototype.fillText = function (t) { escritos.push(String(t)); return fill.apply(this, arguments); };
        CanvasRenderingContext2D.prototype.drawImage = function (img) { if (img && img.src) dibujos.push(img.src.split("/").slice(-2).join("/")); return draw.apply(this, arguments); };
        try { await T.diploma(x); } finally { CanvasRenderingContext2D.prototype.fillText = fill; CanvasRenderingContext2D.prototype.drawImage = draw; }
        const tt = T.textosTablas(), tv = V.textos();
        return { escritos, dibujos, imgAntes: tt.imgAntes, fin: tt.finTexto("Ana"), hoy: tt.hjMensaje("Ana", 2, 3, "", 0), lugar: tt.hjLugar, cal: tv.calRonda(1, "Ana") + " | " + tv.calLugar + " | " + tv.calNombre("Ana") };
      });
      const todo = cert.escritos.join(" | ");
      ok("el certificado dice el evento, la sede y la fecha de la eliminatoria",
        todo.includes("ELIMINATORIA CANTONAL JDN · PÉREZ ZELEDÓN 2026") && todo.includes("Hotel del Sur · Pérez Zeledón · domingo 22 de noviembre de 2026") && /GIORDANO ULCIGRAI RAMÍREZ/.test(todo), todo);
      ok("y nada del Centroamericano (ni el festival, ni La Sabana, ni chess-results)", !/Centroamericano|Festival|Sabana|chess-results/i.test(todo), todo);
      ok("con el logo de ADAPZ y el del CCDR, sin el pizote ni las hojas", cert.dibujos.includes("adapz/logo.jpg") && cert.dibujos.includes("adapz/ccdr-pz.jpg") && !cert.dibujos.some((d) => /centroamericano/.test(d)), JSON.stringify(cert.dibujos));
      ok("las imágenes, «¡Hoy juega!» y el calendario hablan de la eliminatoria",
        cert.imgAntes === "La eliminatoria es el domingo 22 de noviembre" && /Eliminatoria JDN de Pérez Zeledón/.test(cert.fin) && /Eliminatoria JDN de Pérez Zeledón\.$/.test(cert.hoy)
        && cert.lugar === "Hotel del Sur, Pérez Zeledón" && !/Centroamericano|Sabana/.test(cert.cal) && /Pérez Zeledón/.test(cert.cal), JSON.stringify(cert).slice(0, 600));
      ok("«En vivo» y el certificado: sin errores de JavaScript", !r.errores.length, r.errores.join(" | "));
      await r.ctx.close();
    }

    console.log("\nSin torneos publicados");
    const y = await abrir(nav, [OTRO], "#resultados-u12");
    await y.p.waitForFunction(() => !/Cargando/.test(document.getElementById("resultados-u12-contenido").textContent), null, { timeout: 5000 }).catch(() => {});
    ok("«Resultados U12» dice que el torneo todavía no está publicado", /El torneo U12 todavía no está publicado en Pareo Integral/.test(await y.p.textContent("#resultados-u12-contenido")));
    await y.p.keyboard.press("Escape");
    await y.p.click('a.cac-ficha[href="#inscritos"]');
    await y.p.waitForFunction(() => !/Cargando/.test(document.getElementById("inscritos-contenido").textContent), null, { timeout: 5000 }).catch(() => {});
    ok("«Inscritos» dice que todavía no hay aprobados", /Todavía no hay inscritos aprobados/.test(await y.p.textContent("#inscritos-contenido")));
    await y.ctx.close();

    console.log("\nEn el celular");
    const z = await abrir(nav, [U12, U20], "#inscritos", 375);
    await z.p.waitForFunction(() => document.querySelector("#inscritos .jdn-inscrito"), null, { timeout: 5000 }).catch(() => {});
    ok("«Inscritos» sin scroll de costado", await z.p.evaluate(() => { const d = document.getElementById("inscritos"); return d.scrollWidth <= d.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1; }));
    await z.p.keyboard.press("Escape");
    await z.p.click("#ficha-resultados-u12");
    await z.p.waitForFunction(() => document.querySelector("#resultados-u12-contenido .cac-cat-mesa"), null, { timeout: 5000 }).catch(() => {});
    ok("«Resultados U12» sin scroll de costado", await z.p.evaluate(() => { const d = document.getElementById("resultados-u12"); return !!document.querySelector("#resultados-u12-contenido .cac-cat-mesa") && d.scrollWidth <= d.clientWidth + 1; }));
    await z.ctx.close();
  } finally {
    await nav.close();
  }
  console.log(fallos ? "\n" + fallos + " fallo(s)." : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();

/*! rev bfb5bbb0d2d82f9f */
