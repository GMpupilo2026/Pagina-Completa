/* Las bromas entre compañeros (js/bromas.js): lo que se VE de una broma que
   un compañero compró con sus Puntos Ajedrez.

   Quién puede recibir qué lo decide la base (mandar_broma: compañero,
   topes, visión, preferencias, bloqueos, el profe que las apagó). Acá se
   comprueba lo que queda del lado de la página, que es justo lo que se rompe
   sin dar ningún error:

   1. Dónde se cargan: solo en el panel, la tienda de puntos y Entrenamiento
      (lo pone herramientas/academia-cabecera.py). Nunca en un examen, la
      clase en vivo, un torneo ni el diagnóstico.
   2. El tablero arcoíris no se elige a ojo: cada par de colores se mide
      (WCAG AA entre casillas y con las piezas encima).
   3. En el panel: el confeti y el globo se ven, dicen QUIÉN los mandó y se
      marcan vistos; el payaso solo se avisa. Con «menos movimiento» queda el
      aviso y nada se mueve. Con Modo Adaptado no se pinta nada.
   5. Las grandes (gallinas, papel, meteorito…): salen en el panel de a una,
      ocupan la pantalla, el cartel dice QUIÉN la mandó con su contraste
      medido, cada una se marca vista cuando empieza y la tienda las conoce
      todas por su nombre. Con «menos movimiento», solo el aviso.
   6. El ovni, en Entrenamiento: se lleva una pieza de verdad del tablero
      (deja de verse esa y solo esa), aunque el tablero se vuelva a pintar;
      si se mueve, sigue escondida en su casilla nueva, y al minuto vuelve
      con su aviso.
   4. En Entrenamiento: el arcoíris cambia de verdad el color de las casillas
      (le gana al estilo en línea de board-color-themes.js) y el patito avisa.
      El confeti no sale ahí (es del panel).

   Uso:  node herramientas/verificar-todo.js bromas                         */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const RAIZ = path.join(__dirname, "..");
const YO = "u-ana";

const fallos = [];
const ok = (cond, msg) => { if (!cond) fallos.push(msg); };

// ---------- 1) dónde se carga ----------
function lleva(ruta) {
  return ["clases.html", "puntos-tienda.html", "sesion.html"].includes(ruta) || (ruta.startsWith("entreno/") && ruta !== "entreno/diagnostico.html");
}
function paginas(dir, pre) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    if (d.name.startsWith(".") || d.name === "node_modules") return [];
    const rel = pre + d.name;
    if (d.isDirectory()) return paginas(path.join(dir, d.name), rel + "/");
    return d.name.endsWith(".html") ? [rel] : [];
  });
}
{
  const todas = paginas(RAIZ, "");
  const con = todas.filter((r) => fs.readFileSync(path.join(RAIZ, r), "utf8").includes("js/bromas.js"));
  con.filter((r) => !lleva(r)).forEach((r) => ok(false, `${r} carga js/bromas.js y no debería (solo panel, tienda, Entrenamiento y la clase en vivo)`));
  ["clases.html", "puntos-tienda.html", "sesion.html", "entreno/temas.html", "entreno/mates.html", "entreno/mates.html"].forEach((r) =>
    ok(con.includes(r), `${r} no carga js/bromas.js`));
  ["examen.html", "torneo.html", "entreno/diagnostico.html"].forEach((r) =>
    ok(!con.includes(r), `${r} carga js/bromas.js: una broma ahí molesta de verdad`));
  // En la clase, además, el interruptor del profe y el botón del alumno.
  const sesion = fs.readFileSync(path.join(RAIZ, "sesion.html"), "utf8");
  ["js/clase-bromas.js", "js/puntos-regalos.js"].forEach((j) => ok(sesion.includes(j), `sesion.html no carga ${j}`));
}

// ---------- 2) el arcoíris, medido ----------
function luminancia(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contraste(a, b) {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
const PARES_ARCOIRIS = [];
{
  const css = fs.readFileSync(path.join(RAIZ, "css/styles.css"), "utf8");
  const bloque = (css.match(/@keyframes broma-arcoiris\s*\{([\s\S]*?)\n\}/) || [])[1] || "";
  for (const m of bloque.matchAll(/--sq-light:\s*(#[0-9a-f]{6});\s*--sq-dark:\s*(#[0-9a-f]{6})/gi)) PARES_ARCOIRIS.push([m[1], m[2]]);
  ok(PARES_ARCOIRIS.length >= 4, "no encontré los colores del tablero arcoíris en css/styles.css");
  PARES_ARCOIRIS.forEach(([claro, oscuro]) => {
    ok(contraste(claro, oscuro) >= 4.5, `arcoíris ${claro}/${oscuro}: las casillas no se distinguen (${contraste(claro, oscuro).toFixed(2)} < 4,5)`);
    ok(contraste("#ffffff", oscuro) >= 4.5, `arcoíris ${oscuro}: una pieza blanca no se ve encima (${contraste("#ffffff", oscuro).toFixed(2)} < 4,5)`);
    ok(contraste("#000000", claro) >= 4.5, `arcoíris ${claro}: una pieza negra no se ve encima`);
  });
}

// ---------- el doble de Supabase ----------
function clienteFalso(bromas, extraInit) {
  return `
window.__llamadas = [];
${extraInit || ""}
(function () {
  const BROMAS = ${JSON.stringify(bromas)};
  function tabla() {
    const b = {
      select() { return b; }, eq() { return b; }, neq() { return b; }, in() { return b; }, gte() { return b; }, lte() { return b; },
      order() { return b; }, limit() { return b; }, maybeSingle() { return b; }, single() { return b; },
      upsert() { return b; }, insert() { return b; }, update() { return b; },
      then(resolve) { resolve({ data: [], error: null }); },
    };
    return b;
  }
  window.sb = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: ${JSON.stringify(YO)} } } } }),
      getUser: () => Promise.resolve({ data: { user: { id: ${JSON.stringify(YO)} } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: function () {} } } }),
      signOut: () => Promise.resolve({ error: null }),
    },
    from: tabla,
    channel: () => ({ on() { return this; }, subscribe() { return this; }, unsubscribe() {}, send() {} }),
    removeChannel: () => {},
    rpc: function (nombre, args) {
      window.__llamadas.push({ rpc: nombre, args: args });
      if (nombre === "mis_bromas") return Promise.resolve({ data: BROMAS, error: null });
      if (nombre === "saldo_de_puntos") return Promise.resolve({ data: 10, error: null });
      return Promise.resolve({ data: [], error: null });
    },
  };
})();
`;
}

const enUnaHora = () => new Date(Date.now() + 3600000).toISOString();
const BROMAS_PANEL = [
  { id: "b-confeti", tipo: "confeti", de_nombre: "Beto Rojas", frase: null, vence_at: enUnaHora(), created_at: new Date().toISOString() },
  { id: "b-globo", tipo: "globo", de_nombre: "Carla Mora", frase: "Cuac. Eso es todo.", vence_at: enUnaHora(), created_at: new Date().toISOString() },
  { id: "b-payaso", tipo: "payaso", de_nombre: "Beto Rojas", frase: null, vence_at: enUnaHora(), created_at: new Date().toISOString() },
  { id: "b-arcoiris", tipo: "arcoiris", de_nombre: "Carla Mora", frase: null, vence_at: enUnaHora(), created_at: new Date().toISOString() },
  { id: "b-patito", tipo: "patito", de_nombre: "Beto Rojas", frase: null, vence_at: enUnaHora(), created_at: new Date().toISOString() },
];

// ---------- 5a) el cartel de las grandes, medido ----------
const GRANDES = ["gallinas", "papel", "meteorito", "payaso_gigante", "pato_invasor", "gato", "quesos", "platanazo", "ovni", "sandia"];
{
  const css = fs.readFileSync(path.join(RAIZ, "css/styles.css"), "utf8");
  const cartel = (css.match(/\.broma-cartel \{([\s\S]*?)\n\}/) || [])[1] || "";
  const fondo = (cartel.match(/background:\s*(#[0-9a-f]{6})/i) || [])[1];
  const letra = (cartel.match(/[^-]color:\s*(#[0-9a-f]{6})/i) || [])[1];
  ok(fondo && letra, "no encontré los colores del cartel de las bromas grandes en css/styles.css");
  if (fondo && letra) ok(contraste(fondo, letra) >= 4.5, `el cartel de las bromas grandes no se lee (${contraste(fondo, letra).toFixed(2)} < 4,5)`);
  const regalos = fs.readFileSync(path.join(RAIZ, "js/puntos-regalos.js"), "utf8");
  const bromasJs = fs.readFileSync(path.join(RAIZ, "js/bromas.js"), "utf8");
  const sql = fs.readdirSync(path.join(RAIZ, "supabase/migraciones")).filter((f) => f.endsWith(".sql")).sort()
    .map((f) => fs.readFileSync(path.join(RAIZ, "supabase/migraciones", f), "utf8")).filter((t) => t.includes("bromas_tipo_check")).pop() || "";
  GRANDES.forEach((t) => {
    ok(new RegExp("\\b" + t + ": \"").test(regalos), `la tienda no sabe nombrar la broma «${t}» (NOMBRE_BROMA de js/puntos-regalos.js)`);
    ok(new RegExp("\\b" + t + ": \\{").test(bromasJs) || bromasJs.includes('b.tipo === "' + t + '"'), `js/bromas.js no sabe pintar la broma «${t}»`);
    ok(sql.includes("'" + t + "'"), `la base no deja guardar la broma «${t}» (bromas_tipo_check)`);
  });
}

async function abrir(navegador, ruta, opciones) {
  const ctx = await navegador.newContext({ serviceWorkers: "block", reducedMotion: opciones.quieto ? "reduce" : "no-preference" });
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await ctx.addInitScript(clienteFalso(opciones.bromas || BROMAS_PANEL, opciones.init));
  const page = await ctx.newPage();
  await page.goto(`${BASE}/${ruta}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__llamadas.some((l) => l.rpc === "mis_bromas"), null, { timeout: 10000 }).catch(() => {});
  // Quedan programadas y salen con el latido de cada segundo.
  await page.waitForTimeout(1600);
  return { page, ctx };
}
const avisos = (page) => page.$$eval("[data-broma-aviso]", (l) => l.map((x) => x.textContent));
const visibles = (page, sel) => page.$$eval(sel, (l) => l.filter((x) => x.checkVisibility()).length);

async function main() {
  const navegador = await chromium.launch({ executablePath: CHROME });

  // ---------- 3) en el panel (la tienda, que es una página del panel) ----------
  {
    const { page, ctx } = await abrir(navegador, "puntos-tienda.html", {});
    const t = await avisos(page);
    ok(t.some((x) => x.includes("Beto Rojas te mandó una lluvia de confeti")), "el confeti no dice quién lo mandó: " + JSON.stringify(t));
    ok(t.some((x) => x.includes("Carla Mora te mandó un globo: «Cuac. Eso es todo.»")), "el globo no dice quién ni su frase: " + JSON.stringify(t));
    ok(t.some((x) => x.includes("gorro de payaso")), "el payaso no se avisa en el panel");
    ok(!t.some((x) => x.includes("patito") || x.includes("arcoíris")), "el patito y el arcoíris son de Entrenamiento, no del panel");
    ok(await page.$eval("[data-bromas-avisos]", (z) => z.getAttribute("role") === "status"), "los avisos de broma no se anuncian (role=status)");
    ok(await visibles(page, "[data-broma-capa] .broma-confeti") > 0, "el confeti no se ve");
    ok(await page.$eval("[data-broma-capa]", (c) => c.getAttribute("aria-hidden") === "true" && getComputedStyle(c).pointerEvents === "none"),
      "la capa del confeti tapa la página o la lee el lector de pantalla");
    const vistas = await page.evaluate(() => window.__llamadas.filter((l) => l.rpc === "broma_vista").map((l) => l.args.p_id).sort());
    ok(JSON.stringify(vistas) === JSON.stringify(["b-confeti", "b-globo"]), "solo el confeti y el globo (los de una vez) se marcan vistos: " + JSON.stringify(vistas));
    await ctx.close();
  }
  {
    const { page, ctx } = await abrir(navegador, "puntos-tienda.html", { quieto: true });
    ok((await avisos(page)).some((x) => x.includes("lluvia de confeti")), "con «menos movimiento» igual tiene que quedar el aviso");
    ok(await page.$$eval("[data-broma-capa]", (l) => l.length) === 0, "con «menos movimiento» no debería caer confeti ni subir un globo");
    await ctx.close();
  }
  {
    const { page, ctx } = await abrir(navegador, "puntos-tienda.html", { init: "try { localStorage.setItem('oscarBlindMode_v1', '1'); } catch (e) {}" });
    const clase = await page.evaluate(() => document.documentElement.classList.contains("adaptive-mode"));
    ok(clase, "el doble no logró prender el Modo Adaptado (la prueba no prueba nada)");
    ok((await avisos(page)).length === 0 && await page.$$eval("[data-broma-capa]", (l) => l.length) === 0,
      "con Modo Adaptado no se pinta ninguna broma");
    await ctx.close();
  }

  // ---------- 5b) las grandes, en el panel ----------
  {
    const ahora = new Date().toISOString();
    const grandes = GRANDES.filter((t) => t !== "ovni").map((t, i) => ({ id: "g-" + t, tipo: t, de_nombre: i % 2 ? "Beto Rojas" : "Carla Mora", frase: null, vence_at: enUnaHora(), created_at: ahora }));
    const { page, ctx } = await abrir(navegador, "clases.html", { bromas: grandes });
    await page.waitForSelector("[data-broma-escena]", { timeout: 5000 }).catch(() => {});
    const escenas = await page.$$eval("[data-broma-escena]", (l) => l.map((x) => x.getAttribute("data-broma-escena")));
    ok(JSON.stringify(escenas) === JSON.stringify(["gallinas"]), "las bromas grandes tienen que salir de a una, empezando por la primera: " + JSON.stringify(escenas));
    await page.waitForTimeout(1600);
    const cartel = await page.$eval("[data-broma-escena] .broma-cartel", (c) => ({ texto: c.textContent, ve: c.checkVisibility(), ancho: c.getBoundingClientRect().width }))
      .catch(() => null);
    ok(cartel && cartel.ve && cartel.texto.includes("Carla Mora"), "el cartel de la broma grande no dice quién la mandó: " + JSON.stringify(cartel));
    const tam = await page.$eval("[data-broma-escena] .broma-saltito", (g) => g.getBoundingClientRect().height).catch(() => 0);
    ok(tam >= 60, `las gallinas tienen que ser grandes (miden ${Math.round(tam)} px)`);
    ok(await page.$eval("[data-broma-capa]", (c) => c.getAttribute("aria-hidden") === "true" && getComputedStyle(c).pointerEvents === "none"),
      "la capa de la broma grande tapa la página o la lee el lector de pantalla");
    ok((await avisos(page)).some((x) => x.includes("Carla Mora te mandó una invasión de gallinas")), "la broma grande no se avisa con el nombre de quien la mandó");
    let vistas = await page.evaluate(() => window.__llamadas.filter((l) => l.rpc === "broma_vista").map((l) => l.args.p_id));
    ok(JSON.stringify(vistas) === JSON.stringify(["g-gallinas"]), "una broma grande se marca vista cuando empieza, no antes: " + JSON.stringify(vistas));
    if (process.env.FOTOS) await page.screenshot({ path: process.env.FOTOS + "/gallinas.png" });
    // La segunda sale cuando termina la primera (12 segundos).
    await page.waitForFunction(() => document.querySelector("[data-broma-escena]") && document.querySelector("[data-broma-escena]").getAttribute("data-broma-escena") === "papel", null, { timeout: 15000 }).catch(() => {});
    ok(await page.$eval("[data-broma-escena]", (e) => e.getAttribute("data-broma-escena")).catch(() => "") === "papel", "la segunda broma grande no salió después de la primera");
    ok(await page.$$eval("[data-broma-escena]", (l) => l.length) === 1, "dos bromas grandes a la vez");
    await ctx.close();
  }
  if (process.env.FOTOS) {
    // Una foto de cada una a media animación, para mirarlas.
    for (const t of GRANDES.filter((x) => x !== "ovni")) {
      const { page, ctx } = await abrir(navegador, "clases.html", { bromas: [{ id: "f-" + t, tipo: t, de_nombre: "Beto Rojas", frase: null, vence_at: enUnaHora(), created_at: new Date().toISOString() }] });
      await page.waitForTimeout(t === "gato" || t === "quesos" ? 2500 : 3600);
      await page.screenshot({ path: process.env.FOTOS + "/" + t + ".png" });
      await ctx.close();
    }
  }
  {
    const { page, ctx } = await abrir(navegador, "clases.html", { quieto: true, bromas: [{ id: "q-meteorito", tipo: "meteorito", de_nombre: "Beto Rojas", frase: null, vence_at: enUnaHora(), created_at: new Date().toISOString() }] });
    ok((await avisos(page)).some((x) => x.includes("Beto Rojas te mandó un meteorito")), "con «menos movimiento» la broma grande igual se avisa");
    ok(await page.$$eval("[data-broma-capa]", (l) => l.length) === 0, "con «menos movimiento» no se pinta la broma grande");
    await ctx.close();
  }

  // ---------- 6) el ovni se lleva una pieza del tablero ----------
  {
    const ctx = await navegador.newContext({ serviceWorkers: "block" });
    await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
    await ctx.addInitScript(clienteFalso([{ id: "o-1", tipo: "ovni", de_nombre: "Beto Rojas", frase: null, vence_at: enUnaHora(), created_at: new Date().toISOString() }]));
    const page = await ctx.newPage();
    await page.clock.install();
    await page.goto(`${BASE}/entreno/mates.html`, { waitUntil: "domcontentloaded" });
    const SEL = "[data-square] .piece-white, [data-square] .piece-black, [data-square] .chess-piece-illustrated";
    const aLaVista = () => page.$$eval(SEL, (l) => l.filter((x) => x.checkVisibility({ visibilityProperty: true })).length);
    let antes = 0;
    for (let i = 0; i < 20 && !antes; i++) { await page.clock.runFor(500); antes = await aLaVista(); }
    ok(antes > 1, "la prueba no prueba nada: entreno/mates.html no mostró un tablero con piezas");
    await page.clock.runFor(1500);
    ok(await page.$("[data-broma-escena='ovni']") !== null, "el ovni no bajó sobre el tablero");
    ok(await aLaVista() === antes - 1, `el ovni tenía que llevarse UNA pieza (antes ${antes}, ahora ${await aLaVista()})`);
    const t = await avisos(page);
    ok(t.some((x) => x.includes("Beto Rojas mandó un ovni que se llevó una pieza")), "el ovni no avisa quién lo mandó: " + JSON.stringify(t));
    ok((await page.evaluate(() => window.__llamadas.filter((l) => l.rpc === "broma_vista").map((l) => l.args.p_id))).includes("o-1"), "el ovni no se marca visto");
    // El tablero se vuelve a pintar entero (como en cada jugada): sigue escondida.
    await page.evaluate(() => { const t = document.querySelector("[data-broma-ovni]"); t.replaceChildren(...Array.from(t.children).map((c) => c.cloneNode(true))); });
    await page.clock.runFor(1000);
    ok(await aLaVista() === antes - 1, "al volver a pintar el tablero, la pieza que se llevó el ovni volvió a aparecer");
    // La pieza sigue en juego: si se mueve, sigue escondida en su casilla nueva.
    const movida = await page.evaluate(() => {
      const t = document.querySelector("[data-broma-ovni]");
      const sel = ".piece-white, .piece-black, .chess-piece-illustrated";
      const casillas = Array.from(t.querySelectorAll(":scope > [data-square]"));
      const desde = casillas.find((c) => { const p = c.querySelector(sel); return p && !p.checkVisibility({ visibilityProperty: true }); });
      const hasta = casillas.find((c) => !c.querySelector(sel));
      if (!desde || !hasta) return null;
      hasta.appendChild(desde.querySelector(sel));
      return hasta.getAttribute("data-square");
    });
    await page.clock.runFor(500);
    ok(movida && await page.$eval(`[data-broma-ovni] > [data-square="${movida}"] :is(.piece-white, .piece-black, .chess-piece-illustrated)`,
      (p) => !p.checkVisibility({ visibilityProperty: true })).catch(() => false), "al mover la pieza que se llevó el ovni, se volvió a ver");
    ok(await aLaVista() === antes - 1, "al mover la pieza escondida, otra cosa cambió de lo que se ve");
    if (process.env.FOTOS) await page.screenshot({ path: process.env.FOTOS + "/ovni.png" });
    await page.clock.runFor(30000);
    ok(await aLaVista() === antes - 1, "la pieza tiene que seguir escondida a la mitad del minuto");
    await page.clock.runFor(30000);
    ok(await aLaVista() === antes, "al minuto el ovni no devolvió la pieza");
    ok((await avisos(page)).some((x) => new RegExp("El ovni te devolvió .+: está en " + movida + "\\.").test(x)), "al devolverla no dice cuál era ni dónde: " + JSON.stringify(await avisos(page)));
    await ctx.close();
  }

  // ---------- 7) el lugar que eligió quien la manda, y el sonido ----------
  {
    const ahora = new Date().toISOString();
    // AudioContext contado: cuántas veces intenta sonar.
    const contarSonido = "window.__sonidos = 0; window.AudioContext = function () { window.__sonidos++; return { state: 'running', currentTime: 0, destination: {}, resume() { return Promise.resolve(); }, close() {}, createOscillator() { return { type: '', frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect(x) { return x; }, start() {}, stop() {} }; }, createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect(x) { return x; } }; } }; };";
    const una = (id, tipo, extra) => Object.assign({ id, tipo, de_nombre: "Beto Rojas", frase: null, vence_at: enUnaHora(), created_at: ahora }, extra);
    {
      const { page, ctx } = await abrir(navegador, "clases.html", { init: contarSonido, bromas: [una("s-no", "gallinas", { donde: "panel", con_sonido: false })] });
      await page.waitForSelector("[data-broma-escena]", { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(2500);
      ok(await page.$("[data-broma-escena='gallinas']") !== null, "una broma para el panel no salió en el panel");
      ok(await page.evaluate(() => window.__sonidos) === 0, "una broma «solo efectos, sin sonido» igual sonó");
      await ctx.close();
    }
    {
      const { page, ctx } = await abrir(navegador, "clases.html", { init: contarSonido, bromas: [una("s-si", "gallinas", { donde: "panel", con_sonido: true })] });
      await page.waitForSelector("[data-broma-escena]", { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(2500);
      ok(await page.evaluate(() => window.__sonidos) > 0, "una broma «con sonido» no intentó sonar");
      await ctx.close();
    }
    {
      // Una para Entrenamiento y otra para la clase: en el panel, ninguna.
      const { page, ctx } = await abrir(navegador, "clases.html", { bromas: [una("l-e", "quesos", { donde: "entreno" }), una("l-c", "platanazo", { donde: "clase" })] });
      await page.waitForTimeout(2500);
      ok(await page.$$eval("[data-broma-escena]", (l) => l.length) === 0 && (await avisos(page)).length === 0,
        "una broma para Entrenamiento o la clase salió en el panel");
      ok(await page.evaluate(() => !window.__llamadas.some((l) => l.rpc === "broma_vista")), "una broma que no salió se marcó vista");
      await ctx.close();
    }
    {
      const { page, ctx } = await abrir(navegador, "entreno/mates.html", { bromas: [una("l-e2", "quesos", { donde: "entreno" }), una("l-c2", "platanazo", { donde: "clase" })] });
      await page.waitForSelector("[data-broma-escena]", { timeout: 8000 }).catch(() => {});
      ok(await page.$("[data-broma-escena='quesos']") !== null, "una broma para Entrenamiento no salió con el ejercicio a la vista");
      ok(await page.$("[data-broma-escena='platanazo']") === null, "una broma para la clase salió en Entrenamiento");
      await ctx.close();
    }
  }

  // ---------- 8) la clase en vivo: solo con el profe que las encendió y en un ejercicio ----------
  {
    // Una página mínima en /sesion.html: el doble, la caja de una pregunta y
    // el interruptor de la clase hecho a mano. Lo de verdad de la clase lo
    // revisa el verificador de sesion; acá, la regla de cuándo sale.
    const ctx = await navegador.newContext({ serviceWorkers: "block" });
    await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
    await ctx.route("**/sesion.html*", (r) => r.fulfill({ status: 200, contentType: "text/html", body:
      '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/css/tailwind.css"><link rel="stylesheet" href="/css/styles.css"></head><body>'
      + '<div id="question-card" hidden style="width:200px;height:120px">Pregunta</div>'
      + '<script>window.ClaseBromas = { _si: false, encendida() { return this._si; } };</script>'
      + '<script src="/js/bromas.js" defer></script></body></html>' }));
    await ctx.addInitScript(clienteFalso([{ id: "c-1", tipo: "platanazo", de_nombre: "Beto Rojas", frase: null, vence_at: enUnaHora(), created_at: new Date().toISOString(), donde: "clase", con_sonido: true }]));
    const page = await ctx.newPage();
    await page.goto(`${BASE}/sesion.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__llamadas.some((l) => l.rpc === "mis_bromas"), null, { timeout: 10000 }).catch(() => {});
    const salio = () => page.$("[data-broma-escena='platanazo']").then((x) => x !== null);
    await page.waitForTimeout(2200);
    ok(!(await salio()), "en la clase salió una broma con las bromas apagadas");
    await page.evaluate(() => { window.ClaseBromas._si = true; document.dispatchEvent(new CustomEvent("clase-bromas", { detail: { cambio: true } })); });
    await page.waitForTimeout(2200);
    ok(!(await salio()), "en la clase salió una broma sin que el alumno estuviera en un ejercicio");
    await page.evaluate(() => { document.getElementById("question-card").hidden = false; });
    await page.waitForSelector("[data-broma-escena='platanazo']", { timeout: 4000 }).catch(() => {});
    ok(await salio(), "en la clase no salió la broma al abrirse una pregunta con las bromas encendidas");
    ok(await page.evaluate(() => window.__llamadas.some((l) => l.rpc === "broma_vista" && l.args.p_id === "c-1")), "la broma de la clase no se marcó vista al salir");
    await ctx.close();
  }

  // ---------- 4) en Entrenamiento ----------
  {
    const { page, ctx } = await abrir(navegador, "entreno/mates.html", {
      init: "try { localStorage.removeItem('bromas_avisadas_v1'); } catch (e) {}",
    });
    // Salen cuando hay un ejercicio (un tablero con piezas) a la vista.
    await page.waitForFunction(() => document.documentElement.classList.contains("broma-arcoiris"), null, { timeout: 8000 }).catch(() => {});
    // board-color-themes.js escribe los colores EN LÍNEA sobre <html>; el
    // arcoíris tiene que ganarles.
    await page.evaluate(() => { document.documentElement.style.setProperty("--sq-light", "#010203"); document.documentElement.style.setProperty("--sq-dark", "#040506"); });
    const claro = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--sq-light").trim().toLowerCase());
    ok(await page.evaluate(() => document.documentElement.classList.contains("broma-arcoiris")), "el arcoíris no se prendió en Entrenamiento");
    ok(PARES_ARCOIRIS.some(([c]) => c === claro), `el arcoíris no le gana al color en línea del tablero (--sq-light quedó ${claro})`);
    const t = await avisos(page);
    ok(t.some((x) => x.includes("Carla Mora te pintó el tablero de arcoíris")), "el arcoíris no avisa quién lo mandó: " + JSON.stringify(t));
    ok(t.some((x) => x.includes("Beto Rojas te mandó un patito")), "el patito no avisa quién lo mandó: " + JSON.stringify(t));
    ok(!t.some((x) => x.includes("confeti")), "el confeti es del panel: no debería salir en Entrenamiento");
    await ctx.close();

    // Otra página de Entrenamiento: el aviso de la misma broma no se repite.
    const ctx2 = await navegador.newContext({ serviceWorkers: "block" });
    await ctx2.addInitScript(clienteFalso(BROMAS_PANEL));
    await ctx2.addInitScript("try { localStorage.setItem('bromas_avisadas_v1', JSON.stringify(['b-arcoiris', 'b-patito'])); } catch (e) {}");
    await ctx2.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
    const p2 = await ctx2.newPage();
    await p2.goto(`${BASE}/entreno/mates.html`, { waitUntil: "domcontentloaded" });
    await p2.waitForFunction(() => window.__llamadas.some((l) => l.rpc === "mis_bromas"), null, { timeout: 10000 }).catch(() => {});
    await p2.waitForTimeout(3000);
    ok((await avisos(p2)).length === 0, "el aviso de una broma de una hora se repite en cada página");
    ok(await p2.evaluate(() => document.documentElement.classList.contains("broma-arcoiris")), "el arcoíris debería seguir mientras dura, aunque ya se haya avisado");
    await ctx2.close();
  }
  {
    const { page, ctx } = await abrir(navegador, "entreno/mates.html", { quieto: true, init: "try { localStorage.removeItem('bromas_avisadas_v1'); } catch (e) {}" });
    await page.waitForFunction(() => document.documentElement.classList.contains("broma-arcoiris"), null, { timeout: 8000 }).catch(() => {});
    const anim = await page.evaluate(() => getComputedStyle(document.documentElement).animationName);
    ok(anim === "none", `con «menos movimiento» el tablero arcoíris no debería cambiar solo (animación: ${anim})`);
    await ctx.close();
  }

  await navegador.close();
  console.log(fallos.length ? fallos.map((f) => "✗ " + f).join("\n") : "✓ Todo bien: las bromas se ven donde van, dicen quién las mandó y respetan el movimiento reducido y el Modo Adaptado.");
  process.exit(fallos.length ? 1 : 0);
}

main();
