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
  return ruta === "clases.html" || ruta === "puntos-tienda.html" || (ruta.startsWith("entreno/") && ruta !== "entreno/diagnostico.html");
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
  con.filter((r) => !lleva(r)).forEach((r) => ok(false, `${r} carga js/bromas.js y no debería (solo panel, tienda y Entrenamiento)`));
  ["clases.html", "puntos-tienda.html", "entreno/temas.html", "entreno/mates.html", "entreno/coordenadas.html"].forEach((r) =>
    ok(con.includes(r), `${r} no carga js/bromas.js`));
  ["examen.html", "sesion.html", "torneo.html", "entreno/diagnostico.html"].forEach((r) =>
    ok(!con.includes(r), `${r} carga js/bromas.js: una broma ahí molesta de verdad`));
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

async function abrir(navegador, ruta, opciones) {
  const ctx = await navegador.newContext({ serviceWorkers: "block", reducedMotion: opciones.quieto ? "reduce" : "no-preference" });
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await ctx.addInitScript(clienteFalso(opciones.bromas || BROMAS_PANEL, opciones.init));
  const page = await ctx.newPage();
  await page.goto(`${BASE}/${ruta}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__llamadas.some((l) => l.rpc === "mis_bromas"), null, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(400);
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

  // ---------- 4) en Entrenamiento ----------
  {
    const { page, ctx } = await abrir(navegador, "entreno/coordenadas.html", {
      init: "try { localStorage.removeItem('bromas_avisadas_v1'); } catch (e) {}",
    });
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
    await p2.goto(`${BASE}/entreno/coordenadas.html`, { waitUntil: "domcontentloaded" });
    await p2.waitForFunction(() => window.__llamadas.some((l) => l.rpc === "mis_bromas"), null, { timeout: 10000 }).catch(() => {});
    await p2.waitForTimeout(400);
    ok((await avisos(p2)).length === 0, "el aviso de una broma de una hora se repite en cada página");
    ok(await p2.evaluate(() => document.documentElement.classList.contains("broma-arcoiris")), "el arcoíris debería seguir mientras dura, aunque ya se haya avisado");
    await ctx2.close();
  }
  {
    const { page, ctx } = await abrir(navegador, "entreno/coordenadas.html", { quieto: true, init: "try { localStorage.removeItem('bromas_avisadas_v1'); } catch (e) {}" });
    const anim = await page.evaluate(() => getComputedStyle(document.documentElement).animationName);
    ok(anim === "none", `con «menos movimiento» el tablero arcoíris no debería cambiar solo (animación: ${anim})`);
    await ctx.close();
  }

  await navegador.close();
  console.log(fallos.length ? fallos.map((f) => "✗ " + f).join("\n") : "✓ Todo bien: las bromas se ven donde van, dicen quién las mandó y respetan el movimiento reducido y el Modo Adaptado.");
  process.exit(fallos.length ? 1 : 0);
}

main();
