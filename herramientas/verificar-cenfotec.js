/* La página del Desafío Mentes Maestras CENFOTEC 2026 (cenfotec-2026.html).
 *
 * Es la del Centroamericano con otra cara y con el torneo ya terminado: usa
 * los mismos módulos (js/centroamericano-vivo.js y -tablas.js), configurados
 * por js/cenfotec.js. Lo que se rompe acá tampoco da error:
 *
 *   1. EL HTML, leído: cada ficha lleva a algún lado, lo que abre otra pestaña
 *      lleva rel="noopener", lo que se abre encima está permitido en frame-src
 *      y no hay ningún teléfono (no hay uno confirmado para este torneo).
 *   2. LA PÁGINA, en un navegador, con un doble de la función sala-jugadores
 *      que contesta como contesta chess-results con el torneo terminado: ronda
 *      0 (el título dice «Clasificación final», sin número) y un pareo con el
 *      rival sin número. La página tiene que deducir la ronda del cuadro
 *      cruzado y no usar ese pareo: el podio, el buscador («El torneo
 *      terminó», nunca «No aparece en el pareo»), la clasificación final, el
 *      podio sin tabla de medallas, el proyector con la clasificación y la
 *      imagen para compartir con el azul de CENFOTEC.
 *
 *   python3 -m http.server 8777     (desde la raíz del sitio)
 *   node herramientas/verificar-cenfotec.js
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const PAGINA = "cenfotec-2026.html";
const html = fs.readFileSync(path.join(RAIZ, PAGINA), "utf8");

let fallos = 0;
function ok(nombre, cond, detalle) {
  console.log((cond ? "  ✓ " : "  ✗ ") + nombre + (cond || !detalle ? "" : " — " + detalle));
  if (!cond) fallos++;
}

// 1. EL HTML
console.log("El HTML");
ok("el cuerpo lleva las clases de las dos hojas (cac cft) y las carga", /<body class="cac cft /.test(html)
  && html.includes('href="css/centroamericano.css"') && html.includes('href="css/cenfotec.css"'));
const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
ok("js/cenfotec.js carga antes que los módulos que configura", scripts.indexOf("js/cenfotec.js") >= 0
  && scripts.indexOf("js/cenfotec.js") < scripts.indexOf("js/centroamericano-vivo.js")
  && scripts.indexOf("js/centroamericano-vivo.js") < scripts.indexOf("js/centroamericano-tablas.js"), scripts.join(", "));
const fichas = [...html.matchAll(/<(a|div)\b[^>]*class="cac-ficha[^"]*"[^>]*>/g)].map((m) => m[0]);
ok("nueve fichas, y cada una lleva a algún lado", fichas.length === 9 && fichas.every((f) => /^<a\b[^>]*href="[^"#][^"]*"|^<a\b[^>]*href="#[a-z]+"/.test(f)), fichas.length + " fichas");
const afuera = [...html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)].map((m) => m[0]);
ok("lo que abre otra pestaña lleva rel=\"noopener\"", afuera.length > 0 && afuera.every((a) => /rel="noopener"/.test(a)), afuera.filter((a) => !/rel="noopener"/.test(a)).join(" "));
ok("ningún teléfono: no hay uno confirmado para este torneo", !/href="tel:|wa\.me\//.test(html));
const csp = (fs.readFileSync(path.join(RAIZ, "_headers"), "utf8").match(/frame-src ([^;]+)/) || [])[1] || "";
const ventanas = [...html.matchAll(/<a\b[^>]*href="(https:[^"]+)"[^>]*data-ventana=/g)].map((m) => new URL(m[1].replace(/&amp;/g, "&")).hostname);
ok("lo que se abre encima está permitido en frame-src", ventanas.length > 0 && ventanas.every((h) => csp.split(/\s+/).some((s) => s === "https://" + h || (s.startsWith("https://*.") && h.endsWith(s.slice(9))))), ventanas.join(", "));
ok("las partidas van a la sala de cine de la sala «cenfotec»", html.includes('href="transmision.html?torneo=cenfotec"'));
ok("el logo de CENFOTEC existe", fs.existsSync(path.join(RAIZ, "img/cenfotec/logo.png")));

// 2. LA PÁGINA
// Un torneo de mentira con la forma de sala-jugadores: 9 jugadores, 3 rondas,
// el último sin presentarse a ninguna. El cuadro cruzado («r») sale de las
// partidas, para que sea coherente; los puntos y el puesto, también.
const NOMBRES = ["Rojas Mora, Ana Lucia", "Vargas Solis, Bruno", "Castro Pena, Carla", "Diaz Ulate, Daniel",
  "Esquivel Brenes, Elena", "Fallas Arce, Fabio", "Gamboa Rivas, Gabriela", "Herrera Quiros, Hugo", "Ibarra Loria, Ines"];
const PARTIDAS = [
  [[1, 5, 1], [6, 2, 0], [3, 7, 0.5], [8, 4, 0]],
  [[2, 1, 0.5], [4, 3, 1], [5, 6, 1], [7, 8, 1]],
  [[1, 4, 1], [3, 2, 0], [6, 7, 0], [8, 5, 0.5]],
];
const ELOS = [1843, 1898, 1539, 1602, 1701, 0, 1606, 1718, 1737];
const marca = (p) => (p === 1 ? "1" : p === 0.5 ? "½" : "0");
const jug = NOMBRES.map((nombre, i) => ({ no: i + 1, nombre, fed: "CRC", elo: ELOS[i], grupo: "", titulo: "", r: [], pts: 0 }));
PARTIDAS.forEach((ronda) => {
  const jugaron = new Set();
  ronda.forEach(([b, n, res]) => {
    jug[b - 1].r.push(n + "w" + marca(res)); jug[b - 1].pts += res;
    jug[n - 1].r.push(b + "b" + marca(1 - res)); jug[n - 1].pts += 1 - res;
    jugaron.add(b); jugaron.add(n);
  });
  jug.forEach((j) => { if (!jugaron.has(j.no)) j.r.push("-0"); });
});
const fmt = (p) => (Math.floor(p) || (p % 1 ? "" : "0")) + (p % 1 ? "½" : "");
const orden = jug.slice().sort((a, b) => b.pts - a.pts || a.no - b.no);
const DATOS = { torneos: [{ tnr: "1503400", url: "x", leido_en: "2026-10-24T19:34:23Z", ronda: 0, rondas: 0, viejo: false,
  jugadores: orden.map((j, i) => ({ puesto: i + 1, no: j.no, titulo: "", nombre: j.nombre, fed: j.fed, elo: j.elo, grupo: "", puntos: fmt(j.pts), r: j.r })),
  // Como lo lee la función con el torneo terminado: ronda 0 y el rival sin número.
  pareo: { ronda: 0, mesas: [{ mesa: 1, blancas: { no: 1, nombre: NOMBRES[0], titulo: "" }, negras: { no: 0, nombre: NOMBRES[3], titulo: "" }, resultado: "1 - 0" }] } }] };

(async () => {
  const nav = await chromium.launch(fs.existsSync(CHROME) ? { executablePath: CHROME } : {});
  try {
    console.log("\nLa página");
    const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
    await ctx.addInitScript((d) => {
      window.__pedidos = [];
      window.sb = { functions: { invoke: async (nombre, op) => { window.__pedidos.push([nombre, op.body]); return { data: JSON.parse(JSON.stringify(d)), error: null }; } } };
    }, DATOS);
    const p = await ctx.newPage();
    const errores = [];
    p.on("pageerror", (e) => errores.push(String(e)));
    await p.goto(BASE + "/" + PAGINA, { waitUntil: "load" });

    const cara = await p.evaluate(() => ({ portada: getComputedStyle(document.querySelector(".cac-portada")).backgroundImage,
      pildora: [getComputedStyle(document.querySelector(".cac-pildora")).backgroundColor, getComputedStyle(document.querySelector(".cac-pildora")).color],
      ficha: getComputedStyle(document.querySelector(".cac-ficha"), "::before").backgroundColor,
      logo: (() => { const i = document.querySelector(".cft-logo"); return !!(i && i.complete && i.naturalWidth > 0 && i.checkVisibility()); })() }));
    ok("la portada lleva el azul de CENFOTEC y su logo", /35, 48, 101/.test(cara.portada) && cara.logo, JSON.stringify(cara));
    ok("la píldora va en celeste con letra oscura (6,52), no con blanco", cara.pildora[0] === "rgb(35, 172, 244)" && cara.pildora[1] === "rgb(20, 28, 64)", JSON.stringify(cara.pildora));
    ok("las fichas llevan la línea celeste, no la bandera de Costa Rica", cara.ficha === "rgb(35, 172, 244)", cara.ficha);

    // El podio, que se pide al abrir la página.
    await p.waitForFunction(() => document.querySelectorAll("#podio-lista .cft-podio-puesto").length === 3, null, { timeout: 10000 }).catch(() => {});
    const podio = await p.evaluate(() => [...document.querySelectorAll("#podio-lista .cft-podio-puesto")].map((li) => [li.dataset.puesto, li.querySelector(".cft-podio-nombre").textContent, li.querySelector(".cft-podio-puntos").textContent]));
    ok("le pide a la función la sala «cenfotec»", await p.evaluate(() => JSON.stringify(window.__pedidos[0]) === JSON.stringify(["sala-jugadores", { clave: "cenfotec" }])));
    ok("el podio trae los tres primeros, en orden y con sus puntos", podio.length === 3 && podio[0][1] === orden[0].nombre && podio[2][1] === orden[2].nombre && podio[0][2].startsWith(fmt(orden[0].pts) + " puntos"), JSON.stringify(podio));

    // El buscador: el torneo terminado, sin el pareo raro.
    await p.fill("#buscador-nombre", "rojas");
    await p.waitForSelector("#buscador-resultados li");
    const tarjeta = await p.evaluate(() => document.querySelector("#buscador-resultados li").innerText);
    ok("la tarjeta dice el puesto final y los puntos, sin «en» una categoría que no hay", /Puesto 1 de 9 · 2½ puntos/.test(tarjeta) && !/ en \s*·|de 9 en/.test(tarjeta), tarjeta);
    ok("y que el torneo terminó, no «No aparece en el pareo» ni una mesa", /El torneo terminó, a 3 rondas/.test(tarjeta) && !/pareo|Mesa \d/.test(tarjeta), tarjeta);
    await p.click("#buscador-resultados li [data-rondas]");
    const rondas = await p.evaluate(() => document.querySelector("#buscador-resultados .cac-jugador-rondas").innerText);
    ok("«Sus rondas»: las tres, del cuadro cruzado, con el rendimiento", (rondas.match(/Ronda \d/g) || []).length === 3 && /Ronda 1 · blancas · ganó a Esquivel Brenes, Elena/.test(rondas) && /Rendimiento: \d+/.test(rondas), rondas);
    await p.fill("#buscador-nombre", "ibarra");
    await p.waitForFunction(() => /Ibarra/.test(document.getElementById("buscador-resultados").innerText));
    await p.click("#buscador-resultados li [data-rondas]");
    const ausente = await p.evaluate(() => document.querySelector("#buscador-resultados li").innerText);
    ok("quien no se presentó a ninguna ronda no «jugó» nada: sus rondas dicen «no jugó»", (ausente.match(/no jugó/g) || []).length === 3 && !/Rendimiento/.test(ausente), ausente);

    // La clasificación final.
    await p.click('#fichas a.cac-ficha[href="#clasificacion"]');
    await p.waitForSelector("#clasificacion-contenido table");
    const clasif = await p.evaluate(() => ({ estado: document.querySelector("#clasificacion-contenido p").textContent,
      filas: document.querySelectorAll("#clasificacion-contenido tbody tr").length,
      categoria: document.getElementById("clasificacion-categoria").checkVisibility(),
      primera: document.querySelector("#clasificacion-contenido tbody tr").innerText }));
    ok("la clasificación dice que es la final, después de la ronda 3", /Clasificación final, después de la ronda 3/.test(clasif.estado), clasif.estado);
    ok("con los 9 jugadores, y sin el selector de categoría (no hay categorías)", clasif.filas === 9 && !clasif.categoria, JSON.stringify(clasif));
    await p.keyboard.press("Escape");

    // El podio, sin tabla de medallas por federación.
    await p.click('#fichas a.cac-ficha[href="#medallero"]');
    await p.waitForSelector("#medallero-contenido .cac-podio");
    const medallero = await p.evaluate(() => document.getElementById("medallero-contenido").innerText);
    ok("el podio no trae «Medallas por federación» (todos son de Costa Rica)", !/Medallas por federación/.test(medallero) && /Final/.test(medallero), medallero);
    ok("y su encabezado dice «Clasificación general», no «—»", /Clasificación general/.test(medallero) && !/^—$/m.test(medallero), medallero);
    await p.keyboard.press("Escape");

    // El proyector, con la clasificación final.
    await p.click('#fichas a.cac-ficha[href="#proyector"]');
    await p.waitForFunction(() => document.querySelectorAll("#proyector-contenido tbody tr").length > 0, null, { timeout: 10000 }).catch(() => {});
    const proy = await p.evaluate(() => ({ titulo: document.getElementById("proyector-titulo").textContent, filas: document.querySelectorAll("#proyector-contenido tbody tr").length,
      barra: getComputedStyle(document.querySelector(".cac-proyector-barra")).backgroundColor }));
    ok("el proyector pasa la clasificación final, no «el pareo todavía no está publicado»", /Clasificación final/.test(proy.titulo) && proy.filas === 9, JSON.stringify(proy));
    ok("con la barra en el azul de CENFOTEC", proy.barra === "rgb(35, 48, 101)", proy.barra);
    await p.keyboard.press("Escape");

    // La imagen para compartir: el azul arriba y el logo.
    const img = await p.evaluate(async () => {
      const x = window.CentroamericanoVivo.jugadores().find((y) => y.j.puesto === 1);
      const blob = await window.CentroamericanoTablas.imagenJugador(x);
      const bmp = await createImageBitmap(blob);
      const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;
      const ctx = c.getContext("2d"); ctx.drawImage(bmp, 0, 0);
      const px = (a, b) => [...ctx.getImageData(a, b, 1, 1).data.slice(0, 3)].join(",");
      // El logo es blanco: alguna columna de la derecha de la banda tiene blanco.
      let blanco = false;
      for (let a = 700; a < 1020 && !blanco; a += 4) for (let b = 60; b < 190 && !blanco; b += 4) if (px(a, b) === "255,255,255") blanco = true;
      return { tam: [bmp.width, bmp.height], banda: px(5, 5), abajo: px(5, 1075), blanco };
    });
    ok("la imagen para compartir lleva la banda azul de CENFOTEC con su logo", img.tam.join("x") === "1080x1080" && img.banda === "35,48,101" && img.blanco, JSON.stringify(img));
    ok("y abajo las franjas de CENFOTEC, no la bandera", img.abajo === "35,48,101", JSON.stringify(img));
    ok("sin errores de JavaScript", !errores.length, errores.join(" | "));
    await ctx.close();

    // En el celular: sin scroll de costado.
    const ctx2 = await nav.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: "block" });
    await ctx2.addInitScript((d) => { window.sb = { functions: { invoke: async () => ({ data: JSON.parse(JSON.stringify(d)), error: null }) } }; }, DATOS);
    const p2 = await ctx2.newPage();
    await p2.goto(BASE + "/" + PAGINA, { waitUntil: "load" });
    await p2.waitForFunction(() => document.querySelectorAll("#podio-lista .cft-podio-puesto").length === 3, null, { timeout: 10000 }).catch(() => {});
    const ancho = await p2.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    ok("en un celular no hay scroll de costado", ancho[0] <= ancho[1], ancho.join(" > "));
    await ctx2.close();
  } finally {
    await nav.close();
  }
  console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nTodo bien");
  process.exit(fallos ? 1 : 0);
})();
