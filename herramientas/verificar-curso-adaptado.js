/* Comprueba que los cursos de Academia se puedan recorrer con lector de pantalla
   (js/curso-adaptado.js) y qué cambia el Modo Adaptado.

   Cinco peligros, y ninguno da error en pantalla:

   1. LOS ENCABEZADOS. El título de cada lección era un <summary> —que se anuncia
      como botón, no como encabezado— y los bloques eran <h4> colgando de un
      <h2>. Para quien salta de encabezado en encabezado, el curso no existía. Y
      la página se ve exactamente igual esté bien o mal, así que hay que mirar el
      árbol: un solo h1, ningún nivel saltado, y una lección = un encabezado.

   2. EL MATERIAL. En Modo Adaptado se ofrece solo el material en formato
      accesible; el cuadernillo en PDF y la presentación son diagramas. Si el
      filtro se rompe, el PDF vuelve a aparecer y nadie lo nota — salvo quien lo
      abra con un lector de pantalla y no encuentre nada que leer.

   3. LA POSICIÓN ESCRITA. Los visores ya la contaban en palabras, pero en un
      párrafo sr-only al final del visor. Tiene que quedar JUNTO al cuadro donde
      se escribe la jugada, y verse en Modo Adaptado. Se mide el `position` que
      calcula el navegador, no la clase: una clase puesta no garantiza nada.

   4. LOS VIDEOS. Las lecciones ya no ofrecen ninguno. Un enlace que vuelva a
      colarse en un fragmento no falla: simplemente reaparece en la lección, y
      con él la promesa de un video que no está.

   5. LOS PLURALES. "alfils" y "peónes" no son palabras: el lector de pantalla
      las dice tal cual. Estuvieron así en 61 materiales accesibles y en el libro
      del diagnóstico, que es justo lo único que esas personas pueden leer. Se
      revisa el texto que sale de los tres describir/describe del sitio.

   Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
         npm install chess.js@0.10.3
         node herramientas/verificar-curso-adaptado.js                         */
const { chromium } = require("./lib/playwright-con-sesion");
const fs = require("fs");
const path = require("path");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const RAIZ = path.join(__dirname, "..");

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}
function mal(t) { console.log("  ✗ " + t); fallos += 1; }
function bien(t) { console.log("  ✓ " + t); }

const STUB = `
window.SUPABASE_URL = "https://ejemplo.supabase.co";
window.SUPABASE_ANON_KEY = "clave-de-mentira";
window.sb = {
  auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: "u-1" }, access_token: "t" } } }) },
  from: () => { const b = { select: () => b, eq: () => b, order: () => b, limit: () => b, range: () => b,
    maybeSingle: () => b, insert: () => b,
    then: (r) => Promise.resolve({ data: [], error: null }).then(r) }; return b; },
  rpc: () => Promise.resolve({ data: null, error: null }),
  channel: () => ({ on() { return this; }, subscribe() { return this; } }),
};`;

async function abrirCurso(browser, curso, adaptado) {
  const ctx = await browser.newContext();
  await ctx.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: STUB }));
  if (adaptado) await ctx.addInitScript(() => localStorage.setItem("oscarBlindMode_v1", "1"));
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errores.push("console: " + m.text()); });
  await page.goto(BASE + "/cursos/academia/" + curso + ".html", { waitUntil: "networkidle" });
  await page.waitForSelector("#course-content-body details", { timeout: 25000 });
  return { page, ctx, errores };
}

/* ============ 1. Los encabezados ============ */

async function pruebaEncabezados(browser) {
  console.log("\n=== Los encabezados del curso ===");
  const { page, ctx, errores } = await abrirCurso(browser, "fundamentos-del-ajedrez", false);

  const niveles = await page.evaluate(() =>
    Array.from(document.querySelectorAll("main h1, main h2, main h3, main h4, main h5, main h6"))
      .map((h) => ({ n: Number(h.tagName[1]), texto: h.textContent.trim().slice(0, 50) })));

  igual("un solo h1", niveles.filter((h) => h.n === 1).length, "1");

  let salto = null;
  for (let i = 1; i < niveles.length; i += 1) {
    if (niveles[i].n > niveles[i - 1].n + 1) { salto = "h" + niveles[i - 1].n + " → h" + niveles[i].n + " (" + niveles[i].texto + ")"; break; }
  }
  igual("no se salta ningún nivel (antes iba de h2 a h4)", salto || "ninguno", "ninguno");

  // Cada lección tiene que ser un encabezado, dentro de su summary.
  const lecciones = await page.evaluate(() => {
    const sums = Array.from(document.querySelectorAll("#course-content-body details > summary"));
    return {
      total: sums.length,
      conEncabezado: sums.filter((s) => s.querySelector("h1,h2,h3,h4,h5,h6")).length,
      // El <details> tiene que seguir abriéndose: un encabezado dentro del
      // summary no puede robarle el clic.
      primerTitulo: sums[0] ? sums[0].textContent.trim().slice(0, 40) : "",
    };
  });
  igual("todas las lecciones son encabezados", lecciones.conEncabezado, String(lecciones.total));
  if (lecciones.total < 5) mal("el curso trajo muy pocas lecciones (" + lecciones.total + "): ¿se cargó el contenido?");
  else bien(lecciones.total + " lecciones, todas navegables de un salto");

  // Y el summary sigue abriendo y cerrando.
  const abre = await page.evaluate(() => {
    const d = document.querySelector("#course-content-body details");
    const antes = d.open;
    d.querySelector("summary").click();
    return { antes, despues: d.open };
  });
  igual("el encabezado dentro del summary no le quita el clic", abre.antes !== abre.despues, "true");

  // curso-academia.js lee el título de la lección del summary: tiene que seguir leyéndolo.
  igual("el título de la lección sigue siendo legible", /^\d+\./.test(lecciones.primerTitulo), "true");

  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

/* ============ 2. El material ============ */

async function pruebaMaterial(browser) {
  console.log("\n=== El material, en cada modo ===");
  for (const adaptado of [false, true]) {
    const { page, ctx } = await abrirCurso(browser, "fundamentos-del-ajedrez", adaptado);
    const m = await page.evaluate(() => {
      const enlaces = Array.from(document.querySelectorAll("#course-content-body a[href]"));
      const visible = (a) => getComputedStyle(a).display !== "none";
      const tipo = (a) => {
        const h = a.getAttribute("href") || "";
        if (/-accesible\.html/.test(h)) return "accesible";
        if (/\.pdf/i.test(h)) return "pdf";
        if (/\.pptx/i.test(h)) return "presentacion";
        if (/youtube|youtu\.be/.test(h)) return "video";
        return "otro";
      };
      const cuenta = {};
      enlaces.filter(visible).forEach((a) => { const t = tipo(a); cuenta[t] = (cuenta[t] || 0) + 1; });
      const aviso = document.querySelector(".curso-aviso-adaptado");
      return { cuenta, aviso: aviso ? getComputedStyle(aviso).display !== "none" : false };
    });
    if (adaptado) {
      igual("adaptado · el cuadernillo en PDF no se le ofrece", m.cuenta.pdf || 0, "0");
      igual("adaptado · la presentación tampoco", m.cuenta.presentacion || 0, "0");
      if ((m.cuenta.accesible || 0) < 5) mal("adaptado: se quedó sin el material accesible (" + (m.cuenta.accesible || 0) + ")");
      else bien("adaptado · sí queda el material accesible: " + m.cuenta.accesible);
      igual("adaptado · y se explica por qué falta el resto", m.aviso, "true");
    } else {
      if (!m.cuenta.pdf) mal("en modo normal desapareció el PDF, y ahí tiene que estar");
      else bien("normal · el PDF sigue ahí: " + m.cuenta.pdf);
      igual("normal · y el aviso del modo adaptado no estorba", m.aviso, "false");
    }
    // Los cursos ya no ofrecen video. No es cosa del Modo Adaptado: no hay
    // ninguno en ninguno de los dos modos.
    igual((adaptado ? "adaptado" : "normal") + " · ya no se ofrece ningún video", m.cuenta.video || 0, "0");
    await ctx.close();
  }
}

/* Y el barrido: el navegador solo mira un curso, pero los enlaces de video
   estaban en seis de los diez fragmentos. Uno que vuelva a colarse no daría
   ningún error — simplemente aparecería otra vez en la lección. */
function pruebaSinVideos() {
  console.log("\n=== Ningún curso ofrece video ===");
  const dir = path.join(RAIZ, "cursos", "protegido");
  let sueltos = 0;
  fs.readdirSync(dir).filter((n) => n.endsWith(".html")).forEach((n) => {
    const s = fs.readFileSync(path.join(dir, n), "utf8");
    const m = s.match(/youtube\.com|youtu\.be|🎥/g);
    if (m) { mal("cursos/protegido/" + n + " volvió a traer video (" + m.length + ")"); sueltos += m.length; }
  });
  if (!sueltos) bien("ninguno de los fragmentos de curso trae enlace de video");
}

/* Dentro de la plataforma, el temario introductorio sobraba: la lista completa
   de lecciones viene justo debajo, con su contenido. Repetida, quien salta de
   encabezado en encabezado recorre dos veces el mismo índice antes de llegar a
   la primera lección. */
function pruebaSinTemarioDuplicado() {
  console.log("\n=== En la plataforma, el temario no se repite ===");
  const dir = path.join(RAIZ, "cursos", "academia");
  let repes = 0;
  fs.readdirSync(dir).filter((n) => n.endsWith(".html") && n !== "index.html").forEach((n) => {
    const s = fs.readFileSync(path.join(dir, n), "utf8");
    if (/>Temario del curso</.test(s)) { mal("cursos/academia/" + n + " volvió a traer el temario introductorio"); repes += 1; }
  });
  if (!repes) bien("ninguna página de curso de la Academia repite el temario");
}

/* ============ 3. La posición escrita, junto al cuadro de comandos ============ */

async function pruebaVisores(browser) {
  console.log("\n=== La posición escrita y el cuadro de comandos ===");
  const casos = [
    { curso: "el-mapa-de-los-finales", visor: ".f100-viewer", cmd: ".f100-cmd" },
    { curso: "partidas-modelo", visor: ".cp-viewer", cmd: ".cp-cmd" },
  ];
  for (const caso of casos) {
    for (const adaptado of [false, true]) {
      const { page, ctx } = await abrirCurso(browser, caso.curso, adaptado);
      // Los visores se arman al ABRIR su lección (inicialización perezosa).
      await page.evaluate(() => { const d = document.querySelector("#course-content-body details"); if (d) d.open = true; });
      await page.waitForSelector(caso.visor, { timeout: 20000 });
      await page.waitForFunction((s) => {
        const v = document.querySelector(s);
        return v && v.querySelector(".curso-posicion") && v.querySelector(".curso-posicion").textContent.trim().length > 20;
      }, caso.visor, { timeout: 20000 });
      const r = await page.evaluate((c) => {
        const v = document.querySelector(c.visor);
        const desc = v.querySelector(".curso-posicion");
        const cmd = v.querySelector(c.cmd);
        return {
          pegadaAlCuadro: !!(desc && cmd && desc.nextElementSibling === cmd),
          position: desc ? getComputedStyle(desc).position : "no está",
          texto: desc ? desc.textContent.trim() : "",
          vivo: desc ? desc.getAttribute("aria-live") : null,
        };
      }, caso);
      const etiqueta = caso.curso + " · " + (adaptado ? "adaptado" : "normal");
      igual(etiqueta + " · la posición va justo encima del cuadro de comandos", r.pegadaAlCuadro, "true");
      igual(etiqueta + " · " + (adaptado ? "y se ve en pantalla" : "y fuera del modo no se ve (solo la oye el lector)"),
        r.position, adaptado ? "static" : "absolute");
      igual(etiqueta + " · sigue siendo región viva: cada jugada se vuelve a leer", r.vivo, "polite");
      if (adaptado) {
        // Lo que de verdad importa: que la posición esté CONTADA, no dibujada.
        if (!/rey en /.test(r.texto)) mal(etiqueta + ": la posición no dice dónde está el rey");
        else bien(etiqueta + " · la posición va contada pieza por pieza");
      }
      await ctx.close();
    }
  }
}

/* ============ 4. Los plurales ============ */

function pruebaPlurales() {
  console.log("\n=== Los plurales de las piezas ===");
  // "alfils" y "peónes" no existen: el lector de pantalla las dice tal cual.
  const MALOS = /\balfils\b|\bpeónes\b|\bpeóns\b|\breys\b|\btorrs\b/;

  // a) El que arma el material accesible y el libro del diagnóstico.
  const { describir } = require(path.join(RAIZ, "herramientas/lib/describir-fen.js"));
  const inicial = describir("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
  igual("describir-fen dice «alfiles» y «peones»",
    /alfiles en c1, f1/.test(inicial.blancas) && /peones en a2/.test(inicial.blancas), "true");
  igual("y no se le escapa ningún plural inventado", MALOS.test(inicial.blancas + inicial.negras), "false");

  // b) Los archivos que ya estaban generados con el plural malo.
  const sueltos = [];
  const mirar = (f) => { if (MALOS.test(fs.readFileSync(f, "utf8"))) sueltos.push(path.relative(RAIZ, f)); };
  fs.readdirSync(path.join(RAIZ, "cursos/recursos")).forEach((dir) => {
    const carpeta = path.join(RAIZ, "cursos/recursos", dir);
    if (!fs.statSync(carpeta).isDirectory()) return;
    fs.readdirSync(carpeta).filter((n) => n.endsWith("-accesible.html")).forEach((n) => mirar(path.join(carpeta, n)));
  });
  mirar(path.join(RAIZ, "libro-de-diagnostico-accesible.html"));
  igual("ningún material accesible dice «alfils» ni «peónes»",
    sueltos.slice(0, 3).join(", ") || "ninguno", "ninguno");
}

/* Y el de los visores, en el navegador: sale de BlindNotation. */
async function pruebaPluralesEnPantalla(browser) {
  const { page, ctx } = await abrirCurso(browser, "el-mapa-de-los-finales", true);
  await page.evaluate(() => { const d = document.querySelector("#course-content-body details"); if (d) d.open = true; });
  await page.waitForFunction(() => {
    const d = document.querySelector(".f100-viewer .curso-posicion");
    return d && d.textContent.trim().length > 20;
  }, null, { timeout: 20000 });
  const r = await page.evaluate(() => ({
    // La posición inicial de una partida tiene de todo: sirve de muestra.
    muestra: window.BlindNotation ? [BlindNotation.pieceLabel("b", 2), BlindNotation.pieceLabel("p", 2), BlindNotation.pieceLabel("b", 1)] : null,
    textos: Array.from(document.querySelectorAll(".curso-posicion")).map((d) => d.textContent).join(" "),
  }));
  igual("en el navegador también: alfiles, peones, alfil", r.muestra, ["alfiles", "peones", "alfil"]);
  igual("y lo que se pinta no trae plurales inventados",
    /\balfils\b|\bpeónes\b|\bpeóns\b/.test(r.textos), "false");
  await ctx.close();
}

(async () => {
  pruebaPlurales();
  pruebaSinVideos();
  pruebaSinTemarioDuplicado();
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaEncabezados(browser);
    await pruebaMaterial(browser);
    await pruebaVisores(browser);
    await pruebaPluralesEnPantalla(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s)` : "\nLos cursos se pueden recorrer con lector de pantalla.");
  process.exit(fallos ? 1 : 0);
})();
