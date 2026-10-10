/* Juegos Estudiantiles MEP, modo árbitro (jde-arbitro.html,
 * juegos-estudiantiles.html, js/jde-fases.js, la Edge Function jde-publicar
 * y su migración).
 *
 * Lo que se rompe acá no da ningún error: la tabla publica de todas formas
 * sin pasar por el freno, una fase se come los eventos de otra, o la página
 * pública calla una fase entera en vez de decir que no tiene eventos
 * todavía. Tres partes:
 *
 *   1. La migración y la Edge Function, leídas (sin navegador): el candado
 *      de lectura pública, que nadie pueda escribir directo, y que el freno
 *      se llame ANTES de guardar.
 *   2. El modo árbitro, en un navegador: lee el .json de un torneo de Pareo
 *      Integral con el MISMO motor (window.PareoDesempates), pide la
 *      institución de cada fila y publica con el freno de por medio.
 *   3. La página pública, en un navegador: las cuatro fases SIEMPRE se ven,
 *      aunque una no tenga eventos; cada regional con su propia sección; la
 *      normativa del año elegido.
 *
 * Uso:  python3 -m http.server 8777      (desde la raíz del sitio)
 *       node herramientas/verificar-jde-eventos.js
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || process.env.BASE || "http://localhost:8777";
const leer = (r) => fs.readFileSync(path.join(RAIZ, r), "utf8");

let fallos = 0;
const mal = (m, detalle) => { console.log("  ✗ " + m + (detalle ? "\n      " + String(detalle).slice(0, 400) : "")); fallos += 1; };
const bien = (m) => console.log("  ✓ " + m);
const ok = (c, m, detalle) => (c ? bien(m) : mal(m, detalle));
const igual = (m, a, b) => {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  ok(ja === jb, m, ja === jb ? "" : "esperaba " + jb + ", salió " + ja);
};

/* ==================================================================
   1. La migración y la Edge Function
   ================================================================== */
function pruebaBase() {
  console.log("\n=== La migración (supabase/migraciones/..._jde_eventos.sql) ===");
  const archivo = fs.readdirSync(path.join(RAIZ, "supabase/migraciones")).find((f) => /_jde_eventos\.sql$/.test(f));
  ok(!!archivo, "existe una migración *_jde_eventos.sql");
  const sql = leer("supabase/migraciones/" + archivo);
  ok(/alter table public\.jde_eventos enable row level security/.test(sql), "la tabla tiene RLS encendida");
  ok(/create policy jde_eventos_lectura_publica on public\.jde_eventos\s*for select to anon, authenticated\s*using \(true\)/.test(sql),
    "la lectura es pública de verdad (anon y authenticated, using true)");
  ok(/revoke insert, update, delete, truncate on public\.jde_eventos from anon, authenticated/.test(sql),
    "nadie escribe directo (ni anon ni authenticated)");
  ok(!/for insert|for update|for delete/.test(sql), "no hay ninguna política de escritura (solo la Edge Function, con la clave de servicio)");
  ok(/create or replace function public\.jde_frenar\(p_ip text, p_correo text\)/.test(sql), "existe jde_frenar(p_ip, p_correo)");
  ok(/security definer/.test(sql), "jde_frenar es security definer");
  ok(/revoke all on function public\.jde_frenar\(text, text\) from public, anon, authenticated/.test(sql),
    "nadie más que la service role puede llamar a jde_frenar");
  ok(/return interno\.frenar_envio_publico\('formulario', 'jde-publicar', v_correo, v_ip\)/.test(sql),
    "al final usa el freno genérico de envíos públicos (tipo 'formulario', ámbito 'jde-publicar')");
  ok(/ambito = 'jde-publicar' and ip = v_ip[\s\S]*?>= \d+ then/.test(sql) && /ambito = 'jde-publicar' and correo = v_correo[\s\S]*?>= \d+ then/.test(sql),
    "tiene sus propios topes por conexión y por correo, antes del freno genérico");

  console.log("\n=== La Edge Function (supabase/functions/jde-publicar) ===");
  const ts = leer("supabase/functions/jde-publicar/index.ts");
  const frenoPos = ts.search(/admin\.rpc\("jde_frenar"/);
  const insertPos = ts.search(/admin\.from\("jde_eventos"\)\.insert/);
  ok(frenoPos >= 0 && insertPos > frenoPos, "llama al freno ANTES de escribir en jde_eventos");
  ok(/if \(freno\) return json\(\{ ok: false, error: freno \}, 429\)/.test(ts), "si el freno contesta, no sigue (429)");
  ok(/Access-Control-Allow-Origin": SITE_URL/.test(ts), "CORS fijo al sitio");
  ok(/FASES = \["institucional", "regional", "interregional", "nacional"\]/.test(ts), "las cuatro fases, en el mismo orden que js/jde-fases.js");
  ok(/clasificacion\.length < 1 \|\| clasificacion\.length > 300/.test(ts), "la clasificación se acota (1 a 300 puestos)");
  ok(/fase !== "nacional" && region\.length < 2/.test(ts), "exige región salvo en la fase nacional");

  console.log("\n=== js/jde-fases.js y la Edge Function dicen lo mismo ===");
  const js = leer("js/jde-fases.js");
  const fasesJs = [...js.matchAll(/\{ id: "(\w+)", nombre:/g)].map((m) => m[1]).filter((id) => ["institucional", "regional", "interregional", "nacional"].includes(id));
  igual("las cuatro fases, en el mismo orden", fasesJs, ["institucional", "regional", "interregional", "nacional"]);
}

/* ==================================================================
   2 y 3. Las dos páginas, en un navegador
   ================================================================== */
function clienteFalso(cfg) {
  return `
window.SUPABASE_URL = "https://falso.supabase.co";
window.SUPABASE_ANON_KEY = "anon-falsa";
(function () {
  const CFG = ${JSON.stringify(cfg)};
  function q(filas) {
    let datos = Array.isArray(filas) ? filas.slice() : filas;
    const obj = {
      select() { return obj; }, order() { return obj; }, range() { return obj; }, limit() { return obj; },
      eq(c, v) { if (Array.isArray(datos)) datos = datos.filter((f) => String(f[c]) === String(v)); return obj; },
      then(res, rej) { return Promise.resolve({ data: datos, error: null }).then(res, rej); },
    };
    return obj;
  }
  window.__llamadasFunciones = [];
  window.sb = {
    from: (t) => q((CFG.tablas || {})[t] || []),
    functions: {
      invoke: (nombre, opts) => {
        window.__llamadasFunciones.push({ nombre, body: (opts || {}).body });
        const r = (CFG.funciones || {})[nombre];
        return Promise.resolve(r ? r((opts || {}).body) : { data: { ok: true }, error: null });
      },
    },
  };
})();
`;
}

async function abrir(browser, pagina, cfg) {
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(cfg) }));
  await page.goto(BASE + "/" + pagina, { waitUntil: "networkidle" });
  return { ctx, page, errores };
}
const vis = (page, sel) => page.$eval(sel, (e) => e.checkVisibility()).catch(() => false);
const texto = (page, sel) => page.textContent(sel).catch(() => null);

// Un torneo de dos jugadores, armado con el MISMO motor de Pareo Integral
// (no a mano): así el .json que se sube es exactamente el que bajaría
// Pareo Integral, y la clasificación que lea la página tiene que coincidir
// con la que ya da por buena verificar-pareo-desempates.js.
function torneoDePrueba() {
  const T = require(path.join(RAIZ, "js/pareo/torneo.js"));
  const t = T.nuevo({
    nombre: "JDE de prueba",
    jugadores: [{ id: "j1", nombre: "Ana Pérez" }, { id: "j2", nombre: "Luis Mora" }],
  });
  t.rondas = [{ mesas: [{ b: "j1", n: "j2", r: "1-0" }], ausencias: {} }];
  T.fijarNumeracion(t);
  return t;
}

async function pruebaArbitro(browser) {
  console.log("\n=== jde-arbitro.html ===");
  const { ctx, page, errores } = await abrir(browser, "jde-arbitro.html", { funciones: { "jde-publicar": () => ({ data: { ok: true, id: 1 }, error: null }) } });

  igual("las cuatro fases, en orden", await page.$$eval("#ja-fase option", (os) => os.map((o) => o.value)),
    ["institucional", "regional", "interregional", "nacional"]);
  igual("el año 2026 está en el selector", (await page.$$eval("#ja-anio option", (os) => os.map((o) => o.value))).includes("2026"), true);
  ok(await vis(page, "#ja-region-campo"), "con una fase regional, se pide la región");
  await page.selectOption("#ja-fase", "nacional");
  ok(!(await vis(page, "#ja-region-campo")), "con la fase nacional, no se pide la región");
  await page.selectOption("#ja-fase", "regional");

  await page.setInputFiles("#ja-archivo", { name: "roto.json", mimeType: "application/json", buffer: Buffer.from("esto no es json") });
  await page.waitForFunction(() => document.getElementById("ja-archivo-estado").textContent.length > 0);
  ok(/no es un \.json válido/.test(await texto(page, "#ja-archivo-estado")), "un archivo que no es JSON lo dice, y no revienta la página");
  ok(!(await vis(page, "#ja-clasificacion-caja")), "y no muestra ninguna clasificación");

  const t = torneoDePrueba();
  await page.setInputFiles("#ja-archivo", { name: "torneo.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(t)) });
  await page.waitForFunction(() => /Se leyeron/.test(document.getElementById("ja-archivo-estado").textContent));
  ok(await vis(page, "#ja-clasificacion-caja"), "con un torneo válido, se ve la clasificación");
  igual("dos filas, en el orden de la clasificación (quien ganó, primero)",
    await page.$$eval("#ja-clasificacion-cuerpo tr", (trs) => trs.map((tr) => tr.children[1].textContent)),
    ["Ana Pérez", "Luis Mora"]);
  igual("los puntos de cada uno", await page.$$eval("#ja-clasificacion-cuerpo tr", (trs) => trs.map((tr) => tr.children[2].textContent)), ["1", "0"]);
  igual("el nombre del evento se autocompleta con el del torneo", await page.inputValue("#ja-nombre"), "JDE de prueba");

  await page.click("#ja-publicar");
  ok(/Escribe tu nombre|Escribe la región/.test((await texto(page, ".avisos-mensaje[data-tipo=\"error\"]")) || ""),
    "sin árbitro ni región no publica, y lo dice");
  igual("y no llamó a la función", await page.evaluate(() => window.__llamadasFunciones.length), 0);

  await page.fill("#ja-region", "San José Norte");
  await page.fill("#ja-arbitro", "Equipo de prueba");
  await page.fill("#ja-correo", "prueba@ejemplo.cr");
  const filas = await page.$$("#ja-clasificacion-cuerpo tr");
  await (await filas[0].$("input")).fill("Liceo de Prueba");
  await (await filas[1].$("input")).fill("Colegio de Prueba");
  await page.click("#ja-publicar");
  await page.waitForFunction(() => window.__llamadasFunciones.length > 0);
  const llamada = await page.evaluate(() => window.__llamadasFunciones[0]);
  igual("llama a jde-publicar", llamada.nombre, "jde-publicar");
  igual("con la fase, la región y el árbitro escritos", [llamada.body.fase, llamada.body.region, llamada.body.arbitro],
    ["regional", "San José Norte", "Equipo de prueba"]);
  igual("y la clasificación con la institución de cada fila",
    llamada.body.clasificacion.map((f) => [f.puesto, f.nombre, f.puntos, f.institucion]),
    [[1, "Ana Pérez", 1, "Liceo de Prueba"], [2, "Luis Mora", 0, "Colegio de Prueba"]]);
  ok(/publicado/.test((await texto(page, ".avisos-mensaje[data-tipo=\"ok\"]")) || ""), "y avisa que quedó publicado");
  ok(!(await vis(page, "#ja-clasificacion-caja")), "y el formulario se vacía (no queda listo para publicar dos veces)");

  ok(errores.length === 0, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

async function pruebaPagina(browser) {
  console.log("\n=== juegos-estudiantiles.html ===");
  const eventos = [
    {
      anio: 2026, fase: "regional", region: "San José Norte", categoria: "C", rama: "",
      nombre: "JDE 2026 — Regional San José Norte", sede: "Liceo X", fecha: "2026-05-10", arbitro: "Equipo A",
      clasificacion: [
        { puesto: 1, nombre: "Ana Pérez", puntos: 5, institucion: "Liceo de Prueba" },
        { puesto: 4, nombre: "Luis Mora", puntos: 2, institucion: "" },
      ],
    },
    {
      anio: 2026, fase: "regional", region: "Puriscal", categoria: "C", rama: "",
      nombre: "JDE 2026 — Regional Puriscal", sede: "", fecha: null, arbitro: "Equipo B",
      clasificacion: [{ puesto: 1, nombre: "Rivera", puntos: 4, institucion: "" }],
    },
  ];
  const { ctx, page, errores } = await abrir(browser, "juegos-estudiantiles.html", { tablas: { jde_eventos: eventos } });
  await page.waitForFunction(() => document.getElementById("je-estado").textContent === "");

  igual("las cuatro fases se ven, en orden, aunque algunas no tengan eventos",
    await page.$$eval("#je-fases h2", (hs) => hs.map((h) => h.textContent)),
    ["Institucional (o circuital)", "Regional", "Interregional", "Nacional (final)"]);
  const institucional = await page.locator("#je-fases section", { hasText: "Institucional" }).first().textContent();
  ok(/Todavía no hay eventos publicados de esta fase/.test(institucional), "una fase sin eventos lo dice, en vez de quedar en blanco");

  igual("las dos regionales de «Regional», cada una con su encabezado",
    await page.$$eval("#je-fases section h4", (hs) => hs.map((h) => h.textContent)), ["Puriscal", "San José Norte"]);
  const tarjetas = await page.$$("#je-fases article");
  igual("una tarjeta por evento", tarjetas.length, 2);
  ok(/🥇 1\.º/.test(await texto(page, "#je-fases article")), "el primer puesto lleva su medalla");
  const texto1 = await page.$$eval("#je-fases article", (as) => as.map((a) => a.textContent)).then((ts) => ts.find((t) => /Regional San José Norte/.test(t)));
  ok(/4\.º/.test(texto1) && !/🥇 4/.test(texto1), "y un puesto que no es podio sale sin medalla");
  ok(/Liceo de Prueba/.test(texto1), "la institución de cada jugador se ve");

  igual("la normativa de 2026 enlaza al PDF ya subido", await page.getAttribute("#je-normativa a", "href"), "documentos/jde/normativa-pjde-2026.pdf");

  // Un año sin normativa configurada: lo dice, no rompe la página.
  await page.evaluate(() => { const o = document.createElement("option"); o.value = "2027"; o.textContent = "2027"; document.getElementById("je-anio").appendChild(o); });
  await page.selectOption("#je-anio", "2027");
  await page.waitForFunction(() => document.getElementById("je-estado").textContent === "");
  ok(/pendiente de publicar/.test(await texto(page, "#je-normativa")), "un año sin normativa lo dice, no rompe la página");
  ok(/Todavía no hay eventos publicados/.test(await texto(page, "#je-fases")), "y sin eventos de ese año, las cuatro fases lo dicen");

  ok(errores.length === 0, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

(async () => {
  pruebaBase();
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  try {
    await pruebaArbitro(browser);
    await pruebaPagina(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron." : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
