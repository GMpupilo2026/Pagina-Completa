/* Comprueba los ambientes de la sala de las transmisiones (transmision.html,
   js/escenarios-sala.js, las variables --esc-* de css/styles.css). Ver «Los
   ambientes de la sala» en docs/decisiones/juegos-y-torneos.md.

   Lo que se rompe callado acá:
   - un ambiente con un fondo lindo donde el texto no se lee: se MIDE el
     contraste (WCAG AA) de cada texto de la sala contra los fondos de cada
     ambiente, con los colores que el navegador calculó de verdad;
   - un ambiente que la página ofrece y la base no deja guardar (o al revés):
     la lista de js/escenarios-sala.js tiene que ser la misma que la
     restricción de salas_torneo.tema en su migración, y cada uno tiene su
     bloque en el CSS;
   - la elección de quien mira que se pierde al recargar, o que le pisa encima
     el ambiente que eligió administración.

   Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
         node herramientas/verificar-escenarios-sala.js                 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { dobleSalas, SALAS } = require("./lib/doble-salas-torneo");
const { LISTA, POR_OMISION } = require("../js/escenarios-sala.js");

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

// ---- Contraste WCAG ---------------------------------------------------------

function rgba(texto) {
  const m = String(texto).match(/rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/);
  if (m) {
    let a = m[4] == null ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return [+m[1], +m[2], +m[3], a];
  }
  const h = String(texto).trim().match(/^#([0-9a-f]{6})$/i);
  if (h) return [0, 2, 4].map((i) => parseInt(h[1].slice(i, i + 2), 16)).concat(1);
  throw new Error("Color que no se entiende: " + texto);
}
// Una capa semitransparente encima de un fondo opaco.
function encima(fondo, capa) {
  const [r, g, b, a] = capa;
  return [0, 1, 2].map((i) => fondo[i] * (1 - a) + [r, g, b][i] * a).concat(1);
}
function luminancia(c) {
  const [r, g, b] = c.slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contraste(a, b) {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// ---- Sin navegador: la lista, la base y el CSS dicen lo mismo ---------------

function lasTresListas() {
  console.log("\n=== La lista de ambientes, la base y el CSS ===");
  const ids = LISTA.map((e) => e.id);
  igual("siete ambientes, el primero es el cine", [ids.length, ids[0], POR_OMISION], [7, "cine", "cine"]);
  const migraciones = fs.readdirSync(path.join(RAIZ, "supabase/migraciones")).sort().reverse();
  let enLaBase = null;
  for (const f of migraciones) {
    const m = fs.readFileSync(path.join(RAIZ, "supabase/migraciones", f), "utf8").match(/check \(tema in \(([^)]*)\)\)/);
    if (m) { enLaBase = m[1].split(",").map((x) => x.trim().replace(/'/g, "")); break; }
  }
  igual("la restricción de salas_torneo.tema tiene los mismos, en el mismo orden", enLaBase, ids);
  const css = fs.readFileSync(path.join(RAIZ, "css/styles.css"), "utf8");
  igual("cada ambiente (menos el cine, que es el de base) tiene su bloque en el CSS",
    ids.filter((id) => id !== "cine" && css.indexOf('.cine-sala[data-escenario="' + id + '"] {') === -1), []);
  igual("cada uno trae nombre, emoji, antetítulo, título de pizarra y descripción",
    LISTA.filter((e) => !(e.nombre && e.emoji && e.antetitulo && e.pizarra && e.descripcion)).map((e) => e.id), []);
}

// ---- La sala ------------------------------------------------------------------

const TORNEO = { tour: { id: "s7NfNv6H", name: "Desafío de prueba", slug: "desafio" }, defaultRoundId: "R1aaaaaa",
  rounds: [{ id: "R1aaaaaa", name: "Ronda 1", slug: "ronda-1", ongoing: true, url: "https://lichess.org/broadcast/desafio/ronda-1/R1aaaaaa" }] };
// Una partida sin jugadas: Lichess la manda sin «fen», y la sala pone la inicial.
const RONDA = { round: TORNEO.rounds[0], tour: TORNEO.tour, games: [
  { id: "partida1", name: "Ana - Beto", status: "*", players: [{ name: "Ana", rating: 1500 }, { name: "Beto", rating: 1450 }] },
] };

async function abrir(browser, salas, antes) {
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 900 } });
  await ctx.route("**/js/supabase-client.js", (r) =>
    r.fulfill({ status: 200, contentType: "application/javascript", body: dobleSalas({ salas }) }));
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("https://lichess.org/**", (r) => {
    const u = r.request().url();
    const h = { "Access-Control-Allow-Origin": "*" };
    if (u === "https://lichess.org/api/broadcast/s7NfNv6H") return r.fulfill({ contentType: "application/json", headers: h, body: JSON.stringify(TORNEO) });
    if (u.startsWith("https://lichess.org/api/broadcast/desafio/")) return r.fulfill({ contentType: "application/json", headers: h, body: JSON.stringify(RONDA) });
    return r.fulfill({ status: 404, headers: h, body: "" });
  });
  if (antes) await ctx.addInitScript(antes);
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.goto(BASE + "/transmision.html?torneo=cenfotec");
  await page.waitForSelector("#cine-contenido:not(.hidden)");
  return { ctx, page, errores };
}

// Los colores que calculó el navegador, del ambiente puesto ahora.
function leerColores(page) {
  return page.evaluate(() => {
    const sala = document.querySelector(".cine-sala");
    const v = (n) => getComputedStyle(sala).getPropertyValue(n).trim();
    const color = (sel) => getComputedStyle(document.querySelector(sel)).color;
    // Las variables son texto tal como se escribieron: se pasan por un
    // elemento para que el navegador las devuelva como rgb().
    const prueba = document.createElement("span");
    sala.appendChild(prueba);
    const aRgb = (valor) => { prueba.style.color = ""; prueba.style.color = valor; return getComputedStyle(prueba).color; };
    const nombres = ["--esc-fondo", "--esc-fondo-2", "--esc-luz", "--esc-marq", "--esc-marq-2", "--esc-pantalla", "--esc-reloj", "--esc-reloj-texto",
      "--esc-acento", "--esc-acento-texto", "--esc-caja", "--esc-caja-texto", "--esc-pizarra", "--esc-pizarra-luz",
      "--esc-pizarra-texto", "--esc-pizarra-tenue", "--esc-pizarra-puntos", "--esc-pizarra-foco"];
    const vars = {};
    nombres.forEach((n) => { vars[n] = aRgb(v(n)); });
    prueba.remove();
    return {
      vars,
      // Los textos de verdad de la sala (los de Tailwind cambian con el tema de
      // la plataforma, pero con la misma luminancia: ver js/temas-plataforma.js).
      titulo: color("#cine-titulo"),            // blanco
      general: color("main.cine-sala"),         // brand-100
      tenue: color("#cine-sub"),                // brand-200
      ante: color("#cine-antetitulo"),          // accent-400
      ambiente: color("#cine-ambiente"),
      pizarraTitulo: color("#pizarra-titulo"),
      pizarraNota: color("#pizarra-nota"),
      bombillos: getComputedStyle(document.querySelector(".cine-marquesina"), "::before").display,
    };
  });
}

function medir(id, c) {
  const V = (n) => rgba(c.vars[n]);
  const fondos = {
    // El fondo de la sala es un degradado con una luz encima: se mide contra
    // las dos puntas, con la luz entera y un 10 % de blanco más por los adornos
    // (reflectores, rejilla, paneles), que es más de lo que pone cualquiera.
    sala: encima(encima(V("--esc-fondo"), V("--esc-luz")), [255, 255, 255, 0.10]),
    "sala abajo": encima(encima(V("--esc-fondo-2"), V("--esc-luz")), [255, 255, 255, 0.10]),
    marquesina: V("--esc-marq"),
    "marquesina abajo": V("--esc-marq-2"),
    pantalla: V("--esc-pantalla"),
    caja: V("--esc-caja"),
  };
  const textos = { blanco: rgba(c.titulo), "brand-100": rgba(c.general), "brand-200": rgba(c.tenue), "accent-400": rgba(c.ante) };
  const malos = [];
  let peor = 99;
  for (const [nt, t] of Object.entries(textos)) {
    for (const [nf, f] of Object.entries(fondos)) {
      const r = contraste(t, f);
      peor = Math.min(peor, r);
      if (r < 4.5) malos.push(nt + " sobre " + nf + " " + r.toFixed(2));
    }
  }
  const par = (nombre, t, f, minimo) => {
    const r = contraste(t, f);
    peor = Math.min(peor, minimo === 3 ? 99 : r);
    if (r < minimo) malos.push(nombre + " " + r.toFixed(2));
  };
  par("texto de las rondas y el selector sobre su caja", V("--esc-caja-texto"), V("--esc-caja"), 4.5);
  par("la ronda elegida (acento)", V("--esc-acento-texto"), V("--esc-acento"), 4.5);
  par("el reloj", V("--esc-reloj-texto"), V("--esc-reloj"), 4.5);
  par("la última jugada escrita no depende del color, pero el acento se distingue de la pantalla", V("--esc-acento"), V("--esc-pantalla"), 3);
  const piz = V("--esc-pizarra");
  const pizLuz = encima(piz, V("--esc-pizarra-luz"));
  for (const f of [piz, pizLuz]) {
    par("texto de la pizarra", V("--esc-pizarra-texto"), f, 4.5);
    par("texto tenue de la pizarra", V("--esc-pizarra-tenue"), f, 4.5);
    par("puntos de la pizarra", V("--esc-pizarra-puntos"), f, 4.5);
    par("anillo de foco dentro de la pizarra", V("--esc-pizarra-foco"), f, 3);
  }
  // La pestaña elegida va al revés: pizarra sobre tiza. Es el mismo par.
  igual(id + ": el título y la nota de la pizarra usan sus colores (no los de la sala)",
    [c.pizarraTitulo, c.pizarraNota], [c.vars["--esc-pizarra-texto"], c.vars["--esc-pizarra-tenue"]]);
  igual(id + ": el selector de ambiente usa el texto de la caja", c.ambiente, c.vars["--esc-caja-texto"]);
  igual(id + ": todo el texto se lee (AA; el peor par da " + peor.toFixed(2) + ")", malos, []);
}

async function laSala(browser) {
  console.log("\n=== Los siete ambientes, medidos ===");
  const { ctx, page, errores } = await abrir(browser, SALAS);
  igual("sin elección ni ambiente en la base, abre como cine", await page.$eval(".cine-sala", (e) => e.dataset.escenario), "cine");
  igual("el selector ofrece los siete, con su nombre", await page.$$eval("#cine-ambiente option", (o) => o.map((x) => x.textContent)),
    LISTA.map((e) => e.emoji + " " + e.nombre));
  igual("el selector tiene su etiqueta", await page.$eval("#cine-ambiente", (s) => s.labels[0].textContent), "Ambiente");
  const fondosVistos = new Set();
  for (const e of LISTA) {
    await page.selectOption("#cine-ambiente", e.id);
    const c = await leerColores(page);
    igual(e.id + ": la sala se viste así", await page.$eval(".cine-sala", (x) => x.dataset.escenario), e.id);
    igual(e.id + ": el antetítulo y la pizarra cambian de nombre",
      [await page.textContent("#cine-antetitulo"), await page.textContent("#pizarra-titulo")], [e.antetitulo, e.pizarra]);
    fondosVistos.add(c.vars["--esc-fondo"] + c.vars["--esc-pizarra"]);
    medir(e.id, c);
    if (e.id === "salon" || e.id === "club") igual(e.id + ": sin bombillos en la marquesina", c.bombillos, "none");
    if (e.id === "cine") igual("cine: con bombillos", c.bombillos, "block");
  }
  igual("cada ambiente se ve distinto (fondo y pizarra)", fondosVistos.size, LISTA.length);

  console.log("\n=== La elección de quien mira ===");
  await page.selectOption("#cine-ambiente", "planetario");
  await page.reload();
  await page.waitForSelector("#cine-contenido:not(.hidden)");
  igual("al recargar se queda el que eligió", [await page.$eval(".cine-sala", (x) => x.dataset.escenario), await page.inputValue("#cine-ambiente")], ["planetario", "planetario"]);
  igual("sin errores de JavaScript", errores, []);
  await ctx.close();

  console.log("\n=== El ambiente que eligió administración ===");
  const conTema = SALAS.map((s) => s.clave === "cenfotec" ? Object.assign({}, s, { tema: "estadio" }) : s);
  let r = await abrir(browser, conTema);
  igual("la sala abre con el de la base", await r.page.$eval(".cine-sala", (x) => x.dataset.escenario), "estadio");
  igual("y el selector lo dice", await r.page.inputValue("#cine-ambiente"), "estadio");
  await r.ctx.close();
  r = await abrir(browser, conTema, () => { try { localStorage.setItem("sala_ambiente_v1:cenfotec", "arcade"); } catch (e) { /* nada */ } });
  igual("pero lo que eligió quien mira le gana", await r.page.$eval(".cine-sala", (x) => x.dataset.escenario), "arcade");
  await r.ctx.close();
  r = await abrir(browser, conTema, () => { try { localStorage.setItem("sala_ambiente_v1:cenfotec", "discoteca"); } catch (e) { /* nada */ } });
  igual("un valor guardado que no existe no rompe nada: vale el de la base", await r.page.$eval(".cine-sala", (x) => x.dataset.escenario), "estadio");
  igual("sin errores de JavaScript", r.errores, []);
  await r.ctx.close();
  r = await abrir(browser, conTema, () => { Object.defineProperty(window, "localStorage", { get() { throw new Error("bloqueado"); } }); });
  igual("con el almacenamiento bloqueado, abre con el de la base", await r.page.$eval(".cine-sala", (x) => x.dataset.escenario), "estadio");
  await r.page.selectOption("#cine-ambiente", "teatro");
  igual("y se puede cambiar igual", await r.page.$eval(".cine-sala", (x) => x.dataset.escenario), "teatro");
  igual("sin errores de JavaScript", r.errores, []);
  await r.ctx.close();
}

(async () => {
  lasTresListas();
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  try {
    await laSala(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron." : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
