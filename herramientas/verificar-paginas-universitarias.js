/* Las páginas de los torneos universitarios: cenfotec-2026.html (el Desafío
 * Mentes Maestras) y utn-2026.html (el UTN-CONARE, con dos ramas).
 *
 * Son la del Centroamericano con otra cara y con el torneo ya terminado: usan
 * los mismos módulos (js/centroamericano-vivo.js, -tablas.js y
 * js/torneo-podio.js), configurados por js/cenfotec.js y js/utn.js, y la
 * hoja css/universidades.css. Lo que se rompe acá tampoco da error:
 *
 *   1. EL HTML, leído: cada ficha lleva a algún lado, lo que abre otra pestaña
 *      lleva rel="noopener", lo que se abre encima está permitido en frame-src
 *      y no hay ningún teléfono (no hay uno confirmado para estos torneos).
 *   2. LA PÁGINA, en un navegador, con un doble de la función sala-jugadores
 *      que contesta como contesta chess-results con el torneo terminado: ronda
 *      0 (el título dice «Clasificación final», sin número) y un pareo con el
 *      rival sin número. La página tiene que deducir la ronda del cuadro
 *      cruzado y no usar ese pareo: el podio, el buscador («El torneo
 *      terminó», nunca «No aparece en el pareo»), la clasificación final, el
 *      podio sin tabla de medallas, el proyector con la clasificación y la
 *      imagen para compartir con el azul de cada universidad. En la UTN,
 *      además, cada torneo de chess-results es una rama: el puesto, el podio,
 *      la clasificación y el proyector van por rama, no mezclados.
 *
 *   python3 -m http.server 8777     (desde la raíz del sitio)
 *   node herramientas/verificar-paginas-universitarias.js
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

let fallos = 0;
function ok(nombre, cond, detalle) {
  console.log((cond ? "  ✓ " : "  ✗ ") + nombre + (cond || !detalle ? "" : " — " + detalle));
  if (!cond) fallos++;
}

// Un torneo de mentira con la forma de sala-jugadores: 9 jugadores, 3 rondas,
// el último sin presentarse a ninguna. El cuadro cruzado («r») sale de las
// partidas, para que sea coherente; los puntos y el puesto, también.
const PARTIDAS = [
  [[1, 5, 1], [6, 2, 0], [3, 7, 0.5], [8, 4, 0]],
  [[2, 1, 0.5], [4, 3, 1], [5, 6, 1], [7, 8, 1]],
  [[1, 4, 1], [3, 2, 0], [6, 7, 0], [8, 5, 0.5]],
];
const ELOS = [1843, 1898, 1539, 1602, 1701, 0, 1606, 1718, 1737];
const marca = (p) => (p === 1 ? "1" : p === 0.5 ? "½" : "0");
const fmt = (p) => (Math.floor(p) || (p % 1 ? "" : "0")) + (p % 1 ? "½" : "");
function torneo(tnr, nombres) {
  const jug = nombres.map((nombre, i) => ({ no: i + 1, nombre, fed: "CRC", elo: ELOS[i], r: [], pts: 0 }));
  PARTIDAS.forEach((ronda) => {
    const jugaron = new Set();
    ronda.forEach(([b, n, res]) => {
      jug[b - 1].r.push(n + "w" + marca(res)); jug[b - 1].pts += res;
      jug[n - 1].r.push(b + "b" + marca(1 - res)); jug[n - 1].pts += 1 - res;
      jugaron.add(b); jugaron.add(n);
    });
    jug.forEach((j) => { if (!jugaron.has(j.no)) j.r.push("-0"); });
  });
  const orden = jug.slice().sort((a, b) => b.pts - a.pts || a.no - b.no);
  return { orden, datos: { tnr, url: "x", leido_en: "2026-10-24T19:34:23Z", ronda: 0, rondas: 0, viejo: false,
    jugadores: orden.map((j, i) => ({ puesto: i + 1, no: j.no, titulo: "", nombre: j.nombre, fed: j.fed, elo: j.elo, grupo: "", puntos: fmt(j.pts), r: j.r })),
    // Como lo lee la función con el torneo terminado: ronda 0 y el rival sin número.
    pareo: { ronda: 0, mesas: [{ mesa: 1, blancas: { no: 1, nombre: nombres[0], titulo: "" }, negras: { no: 0, nombre: nombres[3], titulo: "" }, resultado: "1 - 0" }] } } };
}
const A = torneo("1503400", ["Rojas Mora, Ana Lucia", "Vargas Solis, Bruno", "Castro Pena, Carla", "Diaz Ulate, Daniel",
  "Esquivel Brenes, Elena", "Fallas Arce, Fabio", "Gamboa Rivas, Gabriela", "Herrera Quiros, Hugo", "Ibarra Loria, Ines"]);
const FEM = torneo("1498221", ["Jara Mena, Julia", "Kopper Vega, Karla", "Leon Rojas, Laura", "Mena Solano, Maria",
  "Nunez Brenes, Nora", "Obando Ruiz, Olga", "Pineda Mora, Paula", "Quesada Lara, Rosa", "Salas Vindas, Sara"]);
const MAS = torneo("1498218", ["Alfaro Mora, Andres", "Barquero Solis, Beto", "Calvo Pena, Carlos", "Duran Ulate, David",
  "Elizondo Brenes, Eric", "Flores Arce, Felipe", "Garro Rivas, Gerardo", "Hidalgo Quiros, Hector", "Ivankovich Loria, Ivan"]);

const PAGINAS = [
  { pagina: "cenfotec-2026.html", clase: "cft", sala: "cenfotec", azul: "35, 48, 101", celeste: "rgb(35, 172, 244)", tinta: "rgb(20, 28, 64)",
    fichas: 9, datos: { torneos: [A.datos] }, ramas: null,
    primero: A.orden[0].nombre, buscar: "rojas", ausente: "ibarra", puesto: "Puesto 1 de 9 · 2½ puntos", rival: "Esquivel Brenes, Elena" },
  { pagina: "utn-2026.html", clase: "utn", sala: "utn", azul: "25, 58, 112", celeste: "rgb(191, 207, 232)", tinta: "rgb(15, 42, 85)",
    fichas: 6, datos: { torneos: [FEM.datos, MAS.datos] }, ramas: ["Femenino", "Masculino"],
    primero: FEM.orden[0].nombre, buscar: "jara", ausente: "salas vindas", puesto: "Puesto 1 de 9 en Femenino · 2½ puntos", rival: "Nunez Brenes, Nora" },
];

// 1. EL HTML
const csp = (fs.readFileSync(path.join(RAIZ, "_headers"), "utf8").match(/frame-src ([^;]+)/) || [])[1] || "";
for (const P of PAGINAS) {
  console.log("El HTML de " + P.pagina);
  const html = fs.readFileSync(path.join(RAIZ, P.pagina), "utf8");
  ok("el cuerpo lleva las clases de las dos hojas (cac cac-u " + P.clase + ") y las carga", new RegExp('<body class="cac cac-u ' + P.clase + " ").test(html)
    && html.includes('href="css/centroamericano.css"') && html.includes('href="css/universidades.css"'));
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  const conf = "js/" + P.sala + ".js";
  ok(conf + " carga antes que los módulos que configura, y el podio después", scripts.indexOf(conf) >= 0
    && scripts.indexOf(conf) < scripts.indexOf("js/centroamericano-vivo.js")
    && scripts.indexOf("js/centroamericano-vivo.js") < scripts.indexOf("js/centroamericano-tablas.js")
    && scripts.indexOf("js/centroamericano-vivo.js") < scripts.indexOf("js/torneo-podio.js"), scripts.join(", "));
  const fichas = [...html.matchAll(/<(a|div)\b[^>]*class="cac-ficha[^"]*"[^>]*>/g)].map((m) => m[0]);
  ok(P.fichas + " fichas, y cada una lleva a algún lado", fichas.length === P.fichas && fichas.every((f) => /^<a\b[^>]*href="[^"]+"/.test(f)), fichas.length + " fichas");
  const ids = new Set([...html.matchAll(/<dialog id="([^"]+)"/g)].map((m) => m[1]));
  const internos = [...html.matchAll(/href="#([a-z-]+)"/g)].map((m) => m[1]).filter((id) => !["main-content", "fichas"].includes(id));
  ok("cada «#…» abre una ventana que está en la página", internos.every((id) => ids.has(id)), internos.filter((id) => !ids.has(id)).join(", "));
  const afuera = [...html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)].map((m) => m[0]);
  ok("lo que abre otra pestaña lleva rel=\"noopener\"", afuera.length > 0 && afuera.every((a) => /rel="noopener"/.test(a)), afuera.filter((a) => !/rel="noopener"/.test(a)).join(" "));
  ok("ningún teléfono: no hay uno confirmado para este torneo", !/href="tel:|wa\.me\//.test(html));
  const ventanas = [...html.matchAll(/<a\b[^>]*href="(https:[^"]+)"[^>]*data-ventana=/g)].map((m) => new URL(m[1].replace(/&amp;/g, "&")).hostname);
  ok("lo que se abre encima está permitido en frame-src", ventanas.length > 0 && ventanas.every((h) => csp.split(/\s+/).some((s) => s === "https://" + h || (s.startsWith("https://*.") && h.endsWith(s.slice(9))))), ventanas.join(", "));
  ok("las partidas van a la sala de cine de la sala «" + P.sala + "»", html.includes('href="transmision.html?torneo=' + P.sala + '"'));
  const logo = (html.match(/<img src="(img\/[a-z]+\/logo\.png)"[^>]*class="u-logo"/) || [])[1];
  ok("el logo de la universidad existe", !!logo && fs.existsSync(path.join(RAIZ, logo)), logo);
}

// 2. LA PÁGINA
(async () => {
  const nav = await chromium.launch(fs.existsSync(CHROME) ? { executablePath: CHROME } : {});
  try {
    for (const P of PAGINAS) {
      console.log("\n" + P.pagina + ", en el navegador");
      const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
      await ctx.addInitScript((d) => {
        window.__pedidos = [];
        window.sb = { functions: { invoke: async (nombre, op) => { window.__pedidos.push([nombre, op.body]); return { data: JSON.parse(JSON.stringify(d)), error: null }; } } };
      }, P.datos);
      const p = await ctx.newPage();
      const errores = [];
      p.on("pageerror", (e) => errores.push(String(e)));
      await p.goto(BASE + "/" + P.pagina, { waitUntil: "load" });

      const cara = await p.evaluate(() => ({ portada: getComputedStyle(document.querySelector(".cac-portada")).backgroundImage,
        pildora: [getComputedStyle(document.querySelector(".cac-pildora")).backgroundColor, getComputedStyle(document.querySelector(".cac-pildora")).color],
        ficha: getComputedStyle(document.querySelector(".cac-ficha"), "::before").backgroundColor,
        logo: (() => { const i = document.querySelector(".u-logo"); return !!(i && i.complete && i.naturalWidth > 0 && i.checkVisibility()); })() }));
      ok("la portada lleva el azul de la universidad y su logo", cara.portada.includes(P.azul) && cara.logo, JSON.stringify(cara));
      ok("la píldora va en el acento con letra oscura, no con blanco", cara.pildora[0] === P.celeste && cara.pildora[1] === P.tinta, JSON.stringify(cara.pildora));
      ok("las fichas llevan la línea del acento, no la bandera de Costa Rica", cara.ficha === P.celeste, cara.ficha);

      // El podio, que se pide al abrir la página: uno por rama.
      const cuantos = (P.ramas || [""]).length * 3;
      await p.waitForFunction((n) => document.querySelectorAll("#podio-lista .u-podio-puesto").length === n, cuantos, { timeout: 10000 }).catch(() => {});
      const podio = await p.evaluate(() => ({ titulos: [...document.querySelectorAll("#podio-lista h3")].map((h) => h.textContent),
        puestos: [...document.querySelectorAll("#podio-lista .u-podio-puesto")].map((li) => [li.dataset.puesto, li.querySelector(".u-podio-nombre").textContent, li.querySelector(".u-podio-puntos").textContent]) }));
      ok("le pide a la función la sala «" + P.sala + "»", await p.evaluate((s) => JSON.stringify(window.__pedidos[0]) === JSON.stringify(["sala-jugadores", { clave: s }]), P.sala));
      ok("el podio trae los tres primeros" + (P.ramas ? " de cada rama, con su nombre" : ", sin un título de grupo") + ", en orden y con sus puntos",
        podio.puestos.length === cuantos && podio.puestos[0][1] === P.primero && podio.puestos[0][2].startsWith("2½ puntos")
        && JSON.stringify(podio.titulos) === JSON.stringify(P.ramas || []), JSON.stringify(podio));

      // El buscador: el torneo terminado, sin el pareo raro.
      await p.fill("#buscador-nombre", P.buscar);
      await p.waitForSelector("#buscador-resultados li");
      const tarjeta = await p.evaluate(() => document.querySelector("#buscador-resultados li").innerText);
      ok("la tarjeta dice el puesto final y los puntos" + (P.ramas ? ", en su rama" : ", sin «en» una categoría que no hay"), tarjeta.includes(P.puesto), tarjeta);
      ok("y que el torneo terminó, no «No aparece en el pareo» ni una mesa", /El torneo terminó, a 3 rondas/.test(tarjeta) && !/pareo|Mesa \d/.test(tarjeta), tarjeta);
      await p.click("#buscador-resultados li [data-rondas]");
      const rondas = await p.evaluate(() => document.querySelector("#buscador-resultados .cac-jugador-rondas").innerText);
      ok("«Sus rondas»: las tres, del cuadro cruzado y con rivales de su torneo, con el rendimiento", (rondas.match(/Ronda \d/g) || []).length === 3
        && rondas.includes("Ronda 1 · blancas · ganó a " + P.rival) && /Rendimiento: \d+/.test(rondas), rondas);
      await p.fill("#buscador-nombre", P.ausente);
      await p.waitForFunction((q) => new RegExp(q.split(" ")[0], "i").test(document.getElementById("buscador-resultados").innerText), P.ausente);
      await p.click("#buscador-resultados li [data-rondas]");
      const ausente = await p.evaluate(() => document.querySelector("#buscador-resultados li").innerText);
      ok("quien no se presentó a ninguna ronda no «jugó» nada: sus rondas dicen «no jugó»", (ausente.match(/no jugó/g) || []).length === 3 && !/Rendimiento/.test(ausente), ausente);

      // La clasificación final.
      await p.click('#fichas a.cac-ficha[href="#clasificacion"]');
      await p.waitForSelector("#clasificacion-contenido table");
      const clasif = await p.evaluate(() => ({ estado: document.querySelector("#clasificacion-contenido p").textContent,
        filas: document.querySelectorAll("#clasificacion-contenido tbody tr").length,
        selector: document.getElementById("clasificacion-categoria").checkVisibility(),
        opciones: [...document.querySelectorAll("#clasificacion-categoria option")].map((o) => o.textContent) }));
      ok("la clasificación dice que es la final, después de la ronda 3", /Clasificación final, después de la ronda 3/.test(clasif.estado), clasif.estado);
      ok(P.ramas ? "una rama por vez (9 de 9, no las dos mezcladas), con el selector de la rama" : "con los 9 jugadores, y sin el selector de categoría (no hay categorías)",
        clasif.filas === 9 && clasif.selector === !!P.ramas && (!P.ramas || JSON.stringify(clasif.opciones) === JSON.stringify(P.ramas)), JSON.stringify(clasif));
      await p.keyboard.press("Escape");

      // El podio, sin tabla de medallas por federación.
      await p.click('#fichas a.cac-ficha[href="#medallero"]');
      await p.waitForSelector("#medallero-contenido .cac-podio");
      const medallero = await p.evaluate(() => ({ texto: document.getElementById("medallero-contenido").innerText,
        titulos: [...document.querySelectorAll("#medallero-contenido .cac-podio h3")].map((h) => h.textContent) }));
      ok("el podio no trae «Medallas por federación» (todos son de Costa Rica)", !/Medallas por federación/.test(medallero.texto) && /Final/.test(medallero.texto), medallero.texto);
      ok("y su encabezado es " + (P.ramas ? "el de cada rama" : "«General»") + ", no «—»", JSON.stringify(medallero.titulos) === JSON.stringify(P.ramas || ["General"]), JSON.stringify(medallero.titulos));
      await p.keyboard.press("Escape");

      // El proyector: terminado, los podios y después la clasificación de cada
      // grupo (nunca «el pareo todavía no está publicado»).
      await p.click('#fichas a.cac-ficha[href="#proyector"]');
      await p.waitForFunction(() => document.querySelector("#proyector-contenido section, #proyector-contenido tbody tr"), null, { timeout: 10000 }).catch(() => {});
      const pantallas = [];
      for (let i = 0; i < 1 + (P.ramas || [""]).length; i++) {
        pantallas.push(await p.evaluate(() => ({ titulo: document.getElementById("proyector-titulo").textContent,
          filas: document.querySelectorAll("#proyector-contenido tbody tr").length,
          podios: [...document.querySelectorAll("#proyector-contenido section h3")].map((h) => h.textContent) })));
        await p.click("#proyector-siguiente");
      }
      const proy = { barra: await p.evaluate(() => getComputedStyle(document.querySelector(".cac-proyector-barra")).backgroundColor) };
      const grupos = P.ramas || ["General"];
      ok("el proyector pasa los podios" + (P.ramas ? " de las dos ramas" : ""), pantallas[0].titulo === "Los podios" && JSON.stringify(pantallas[0].podios) === JSON.stringify(grupos), JSON.stringify(pantallas[0]));
      ok("y la clasificación final de " + (P.ramas ? "cada rama, con su nombre" : "todos, «General», no «—»"),
        grupos.every((g, i) => pantallas[i + 1].titulo === "Clasificación · " + g + " · tras la ronda 3" && pantallas[i + 1].filas === 9), JSON.stringify(pantallas.slice(1)));
      ok("con la barra en el azul de la universidad", proy.barra === "rgb(" + P.azul + ")", proy.barra);
      await p.keyboard.press("Escape");

      // La imagen para compartir: el azul arriba y el logo.
      const img = await p.evaluate(async () => {
        const x = window.CentroamericanoVivo.jugadores().find((y) => y.j.puesto === 1);
        const blob = await window.CentroamericanoTablas.imagenJugador(x);
        const bmp = await createImageBitmap(blob);
        const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;
        const ctx = c.getContext("2d"); ctx.drawImage(bmp, 0, 0);
        const px = (a, b) => [...ctx.getImageData(a, b, 1, 1).data.slice(0, 3)].join(", ");
        // El logo es blanco: alguna casilla de la derecha de la banda tiene blanco.
        let blanco = false;
        for (let a = 700; a < 1020 && !blanco; a += 4) for (let b = 40; b < 220 && !blanco; b += 4) if (px(a, b) === "255, 255, 255") blanco = true;
        return { tam: [bmp.width, bmp.height], banda: px(5, 5), abajo: px(5, 1075), blanco };
      });
      ok("la imagen para compartir lleva la banda azul de la universidad con su logo", img.tam.join("x") === "1080x1080" && img.banda === P.azul && img.blanco, JSON.stringify(img));
      ok("y abajo sus franjas, no la bandera", img.abajo === P.azul, JSON.stringify(img));
      ok("sin errores de JavaScript", !errores.length, errores.join(" | "));
      await ctx.close();

      // En el celular: sin scroll de costado.
      const ctx2 = await nav.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: "block" });
      await ctx2.addInitScript((d) => { window.sb = { functions: { invoke: async () => ({ data: JSON.parse(JSON.stringify(d)), error: null }) } }; }, P.datos);
      const p2 = await ctx2.newPage();
      await p2.goto(BASE + "/" + P.pagina, { waitUntil: "load" });
      await p2.waitForFunction((n) => document.querySelectorAll("#podio-lista .u-podio-puesto").length === n, cuantos, { timeout: 10000 }).catch(() => {});
      const ancho = await p2.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
      ok("en un celular no hay scroll de costado", ancho[0] <= ancho[1], ancho.join(" > "));
      await ctx2.close();
    }
  } finally {
    await nav.close();
  }
  console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nTodo bien");
  process.exit(fallos ? 1 : 0);
})();
