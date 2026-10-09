/* revisar-desempates.html — Revisa los desempates.

   Con páginas de chess-results de prueba (la misma forma que las reales del
   9/10/2026 —cuadro cruzado de un suizo, matriz de un todos contra todos y los
   emparejamientos por ronda—, con nombres inventados), y la Edge Function
   cambiada por una que las devuelve, comprueba:
   - el suizo: lee las celdas «6w1», «2b1», «3w½», «5w+», «4b-», «-1» y «-½»;
     los puntos dan lo de chess-results; el Buchholz «variabel with
     parameter» se reconoce como el sin el peor (BH-C1) porque es el que da
     los números publicados, y el que no coincide sale marcado y escrito;
   - la explicación de un jugador: cada rival con sus puntos y el rival
     ficticio del bye cortado; «¿Por qué quedó delante?» dice qué criterio
     separa a dos empatados en puntos;
   - el todos contra todos: lee la matriz y las rondas (con colores), y el
     encuentro directo separa a los dos empatados;
   - una página sin cuadro cruzado (por equipos) y el freno de la función dan
     un aviso, no una página rota; una dirección que no es de chess-results
     no sale a pedir nada;
   - un nombre con HTML se pinta como texto; el enlace ?t=… abre el torneo;
   - a 400 px no hay desplazamiento horizontal, y el modo oscuro.

   Ver «Revisa los desempates» en docs/decisiones/juegos-y-torneos.md.

       node herramientas/verificar-revisar-desempates.js                             */
"use strict";
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL || "http://localhost:8777";

let fallos = 0;
function cierto(nombre, valor, detalle) {
  if (valor) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : "")); fallos += 1; }
}
const limpio = (s) => (s || "").replace(/[\s  ]+/g, " ").trim();

// ---- Las páginas de prueba ----
const fila = (celdas, clase) => '<tr class="' + (clase || "CRng2 CRC") + '">' + celdas.map((c) => '<td class="CRc">' + c + "</td>").join("") + "</tr>";
const pagina = (h2, tabla, anotacion) => '<html lang="es"><body><h2>' + h2[0] + "</h2> <h2>" + h2[1] + '</h2><div><table class="CRs1" border="0" cellpadding="1" cellspacing="1">'
  + tabla + "</table>" + (anotacion ? "<p><b>Anotación:</b><br/>" + anotacion.join("<br/>") + "</p>" : "") + "</div></body></html>";

const MALO = "&lt;img src=x id=inyectado onerror=window.__inyectado=1&gt;";
// Suizo de 6 y 3 rondas: 1 Ana 2½, 2 Carla 2, 3 Beto 2, 4 Dani 2, 5 Eva 1, 6 (nombre con HTML) 0.
// Ronda 2: Dani gana sin jugar a Eva. Ronda 3: Carla bye de un punto, Eva bye de medio.
const SUIZO = pagina(["JDE Regional Muestra Individual D", "Cuadro cruzado por clasificación final después de 3 rondas"],
  '<tr class="CRng1b"><th>Rk.</th><th></th><th>Nombre</th><th>Elo</th><th>FED</th><th>1.Rd</th><th>2.Rd</th><th>3.Rd</th><th>&nbsp;Des 1&nbsp;</th><th>&nbsp;Des 2&nbsp;</th><th>&nbsp;Des 3&nbsp;</th><th>&nbsp;Des 4&nbsp;</th></tr>'
  + fila(["1", "", "Solano Mora Ana", "1600", "CRC", " 6w1", " 2b1", " 3w½", "2,5", "4", "0", "2"])
  + fila(["2", "", "Quesada Rojas Carla", "1500", "CRC", " 4w1", " 1w0", "  -1", "2", "4,5", "0", "2"], "CRng1 CRC")
  + fila(["3", "", "Vargas Núñez Beto", "1550", "CRC", " 5w½", " 6b1", " 1b½", "2", "3,5", "0", "1"])
  + fila(["4", "", "Brenes Soto Dani", "1450", "CRC", " 2b0", " 5w+", " 6w1", "2", "3", "0", "2"], "CRng1 CRC")
  + fila(["5", "", "Araya León Eva", "1400", "CRC", " 3b½", " 4b-", "  -½", "1", "2,5", "0", "0"])
  + fila(["6", "", MALO, "0", "CRC", " 1b0", " 3w0", " 4b0", "0", "4,5", "0", "0"], "CRng1 CRC"),
  ["Desempate 1: points (game-points)", "Desempate 2: Buchholz Tie-Breaks (variabel with parameter)", "Desempate 3: Direct Encounter (DE)", "Desempate 4: Number of wins including byes (WIN) (Matchpoints, Forfeited games count)"]);

// Todos contra todos de 4: 1 Hugo 2, 2 Iris 1½, 3 Gina 1½, 4 Juan 1. Iris le ganó a Gina.
const TODOS = pagina(["JDE Interregional Muestra Individual C", "Cuadro cruzado por clasificación final después de 3 rondas"],
  '<tr class="CRng1b"><th>Rk.</th><th>Nombre</th><td>1</td><td>2</td><td>3</td><td>4</td><th>&nbsp;Des 1&nbsp;</th><th>&nbsp;Des 2&nbsp;</th><th>&nbsp;Des 3&nbsp;</th></tr>'
  + fila(["1", "Mora Díaz, Hugo", "*", "½", "½", "1", "2", "0", "2,5"])
  + fila(["2", "Rojas Vega, Iris", "½", "*", "1", "0", "1,5", "1", "2,5"], "CRng1 CRC")
  + fila(["3", "Soto Ruiz, Gina", "½", "0", "*", "1", "1,5", "0", "2"])
  + fila(["4", "León Mata, Juan", "0", "1", "0", "*", "1", "0", "1,5"], "CRng1 CRC"),
  ["Desempate 1: points (game-points)", "Desempate 2: Direct Encounter (DE)", "Desempate 3: Sonneborn-Berger-Tie-Break variable"]);
const ronda = (n, mesas) => '<tr class="CRg1b"><td class="none" colspan="4">' + n + ". Ronda</td></tr>"
  + '<tr class="CRng1b"><th>M.</th><td>White</td><th>Resultado</th><td>Black</td></tr>'
  + mesas.map((m, i) => fila([String(i + 1), m[0], m[1], m[2], ""])).join("");
const RONDAS = pagina(["JDE Interregional Muestra Individual C", "Emparejamientos/Resultados"],
  ronda(1, [["Soto Ruiz, Gina", "½ - ½", "Mora Díaz, Hugo"], ["Rojas Vega, Iris", "0 - 1", "León Mata, Juan"]])
  + ronda(2, [["Mora Díaz, Hugo", "½ - ½", "Rojas Vega, Iris"], ["León Mata, Juan", "0 - 1", "Soto Ruiz, Gina"]])
  + ronda(3, [["Soto Ruiz, Gina", "0 - 1", "Rojas Vega, Iris"], ["Mora Díaz, Hugo", "1 - 0", "León Mata, Juan"]]));

// Tres empatados que se ganaron en círculo: el encuentro directo no los
// separa y chess-results escribe 0 a los tres (como en los torneos reales).
const CIRCULO = pagina(["JDE Muestra en círculo", "Cuadro cruzado por clasificación final después de 3 rondas"],
  '<tr class="CRng1b"><th>Rk.</th><th>Nombre</th><th>Elo</th><th>1.Rd</th><th>2.Rd</th><th>3.Rd</th><th>&nbsp;Des 1&nbsp;</th><th>&nbsp;Des 2&nbsp;</th><th>&nbsp;Des 3&nbsp;</th></tr>'
  + fila(["1", "Uno Primero", "0", " 2w1", " 4w1", " 3b0", "2", "0", "2"])
  + fila(["2", "Dos Segundo", "0", " 1b0", " 3w1", " 4b1", "2", "0", "2"])
  + fila(["3", "Tres Tercero", "0", " 4w1", " 2b0", " 1w1", "2", "0", "2"])
  + fila(["4", "Cuatro Cuarto", "0", " 3b0", " 1b0", " 2w0", "0", "0", "0"]),
  ["Desempate 1: points (game-points)", "Desempate 2: Direct Encounter (DE) (Forfeited games count)", "Desempate 3: Number of wins including byes (WIN) (Matchpoints, Forfeited games count)"]);

// Uno por equipos: el cuadro no tiene «Rk.» con jugadores sino equipos.
const EQUIPOS = pagina(["JDE Equipos Muestra", "Cuadro cruzado por clasificación (Pts.)"],
  '<tr class="CRng1b"><th>No.</th><th>Equipo</th><th>1</th><th>2</th></tr>' + fila(["1", "Liceo de Muestra", "*", "2"]));

(async () => {
  const browser = await chromium.launch();
  const pedidos = [];

  async function abrir(consulta, opciones) {
    const ctx = await browser.newContext(Object.assign({ serviceWorkers: "block" }, opciones || {}));
    await ctx.route("**/*", (ruta) => {
      const req = ruta.request();
      const url = req.url();
      if (url.includes("/functions/v1/revisar-desempates")) {
        if (req.method() === "OPTIONS") return ruta.fulfill({ status: 200, body: "ok", headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" } });
        const cuerpo = JSON.parse(req.postData() || "{}");
        pedidos.push(cuerpo);
        const tnr = (/tnr(\d+)/.exec(cuerpo.url || "") || [])[1];
        const responder = (status, datos) => ruta.fulfill({ status, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(datos) });
        if (tnr === "1004") return responder(429, { error: "Llegaron demasiados envíos seguidos desde tu conexión. Espera un rato e intenta de nuevo." });
        const html = { "1001": { 4: SUIZO }, "1002": { 4: TODOS, 2: RONDAS }, "1003": { 4: EQUIPOS }, "1005": { 4: CIRCULO } }[tnr];
        return html && html[cuerpo.art] ? responder(200, { html: html[cuerpo.art] }) : responder(502, { error: "No se pudo leer el torneo en chess-results." });
      }
      return url.startsWith(BASE) ? ruta.continue() : ruta.fulfill({ status: 200, body: "", contentType: "text/plain" });
    });
    const page = await ctx.newPage();
    const errores = [];
    page.on("pageerror", (e) => errores.push(e.message));
    page.on("dialog", (d) => { errores.push("diálogo: " + d.message()); d.dismiss(); });
    await page.goto(BASE + "/revisar-desempates.html" + (consulta || ""), { waitUntil: "load" });
    return { ctx, page, errores };
  }
  async function leer(page, url) {
    await page.fill("#rd-url", url);
    await page.click("#rd-leer");
    await page.waitForFunction(() => !document.getElementById("rd-leer").disabled && !/Leyendo/.test(document.getElementById("rd-estado").textContent), null, { timeout: 15000 });
  }
  const textoDe = (page, sel) => page.$eval(sel, (n) => n.textContent).then(limpio);
  const celdas = (page) => page.$$eval("#rd-tabla tbody tr", (trs) => trs.map((tr) => [...tr.children].map((c) => c.textContent.replace(/[\s  ]+/g, " ").trim())));

  // ---- 1. El suizo ----
  console.log("Un suizo");
  {
    const { ctx, page, errores } = await abrir();
    cierto("antes de leer no hay resultado", !(await page.$eval("#rd-resultado", (n) => n.checkVisibility())));
    pedidos.length = 0;
    await leer(page, "https://www.google.com/tnr1001.aspx");
    cierto("una dirección que no es de chess-results no sale a pedir nada", pedidos.length === 0 && (await textoDe(page, "#rd-estado")).includes("Pega la dirección"));
    await leer(page, "https://s3.chess-results.com/tnr1001.aspx?lan=2&art=1");
    cierto("pide solo el cuadro cruzado (art=4)", pedidos.length === 1 && pedidos[0].art === 4, JSON.stringify(pedidos));
    cierto("se ve el resultado", await page.$eval("#rd-resultado", (n) => n.checkVisibility()));
    cierto("dice suizo, 6 jugadores y 3 rondas", (await textoDe(page, "#rd-subtitulo")) === "Suizo · 6 jugadores · 3 rondas", await textoDe(page, "#rd-subtitulo"));
    const criterios = await page.$$eval("#rd-criterios li", (ls) => ls.map((l) => l.textContent.replace(/\s+/g, " ").trim()));
    cierto("los puntos coinciden con chess-results (con el bye de uno y el de medio)", criterios[0] && criterios[0].startsWith("Puntos") && criterios[0].includes("Coinciden"), criterios[0]);
    cierto("el Buchholz sin corte dicho se reconoce como el sin el peor (BH-C1)", criterios[1] && criterios[1].includes("(BH-C1)") && criterios[1].includes("no dice el corte"), criterios[1]);
    cierto("y dice en cuántos coincide (5 de 6)", criterios[1] && criterios[1].includes("Coincide en 5 de 6"), criterios[1]);
    cierto("el encuentro directo y las rondas ganadas coinciden en todos", criterios[2].includes("(DE)") && criterios[2].includes("Coincide con chess-results en los 6") && criterios[3].includes("(WIN)") && criterios[3].includes("en los 6"), criterios.slice(2).join(" | "));
    const t = await celdas(page);
    cierto("la tabla trae los 6 en el orden de chess-results", t.length === 6 && t.map((f) => f[0]).join("") === "123456");
    cierto("Carla: 2 puntos, BH-C1 4,5, WIN 2", t[1] && t[1][2] === "2" && t[1][3] === "4,5" && t[1][5] === "2", JSON.stringify(t[1]));
    cierto("el número que no coincide va marcado y con el de chess-results escrito", t[4] && t[4][3] === "3chess-results: 2,5" || (t[4] && t[4][3].startsWith("3") && t[4][3].includes("chess-results: 2,5")), JSON.stringify(t[4]));
    cierto("y su celda lleva la marca de distinto", await page.$eval("#rd-tabla tbody tr:nth-child(5) td:nth-child(4)", (td) => td.classList.contains("rd-distinto")));
    const inj = await page.evaluate(() => ({ img: !!document.querySelector("#inyectado"), flag: !!window.__inyectado, texto: document.querySelector("#rd-tabla tbody tr:nth-child(6) th").textContent }));
    cierto("un nombre con HTML se pinta como texto y no ejecuta nada", !inj.img && !inj.flag && inj.texto.startsWith("<img"), JSON.stringify(inj));
    cierto("la dirección guarda el torneo", (new URL(page.url()).searchParams.get("t") || "").includes("tnr1001"));

    await page.click("button.rd-explicar[data-id='2']");
    cierto("al explicar a Carla se ve el detalle con el foco en su nombre", (await page.$eval("#rd-detalle", (n) => n.checkVisibility())) && (await page.evaluate(() => document.activeElement.id)) === "rd-detalle-t");
    cierto("y su botón queda marcado", (await page.$eval("button.rd-explicar[data-id='2']", (b) => b.getAttribute("aria-pressed"))) === "true");
    const bh = await page.$$eval("#rd-detalle .rd-criterio:nth-child(2) li", (ls) => ls.map((l) => ({ t: l.textContent.trim(), cortado: l.classList.contains("rd-cortado") })));
    cierto("el BH-C1 de Carla: Dani (2) y Ana (2,5) cuentan…", bh.length === 3 && bh[0].t.includes("Brenes Soto Dani (2 pts)") && !bh[0].cortado && bh[1].t.includes("Solano Mora Ana (2,5 pts)"), JSON.stringify(bh));
    cierto("…y el rival ficticio de su bye (1,5) se corta", bh[2] && bh[2].cortado && bh[2].t.includes("rival ficticio con 1,5 pts") && bh[2].t.includes("se corta"), JSON.stringify(bh[2]));
    const pts = await page.$$eval("#rd-detalle .rd-criterio:nth-child(1) li", (ls) => ls.map((l) => l.textContent.trim()));
    cierto("los puntos de Carla, ronda por ronda, con el bye", pts.join(" | ") === "Ronda 1: con blancas contra Brenes Soto Dani (1) | Ronda 2: con blancas contra Solano Mora Ana (0) | Ronda 3: bye de un punto (1)", pts.join(" | "));
    await page.click("button.rd-explicar[data-id='4']");
    const win = await page.$$eval("#rd-detalle .rd-criterio:nth-child(4) li", (ls) => ls.map((l) => l.textContent.trim()));
    cierto("las rondas ganadas de Dani cuentan la que ganó sin jugar", win.length === 2 && win[0].includes("ganó sin jugar"), win.join(" | "));

    await page.selectOption("#rd-a", "2");
    await page.selectOption("#rd-b", "3");
    await page.click("#rd-comparar");
    const comp = await page.$$eval("#rd-comparacion li", (ls) => ls.map((l) => l.textContent.replace(/\s+/g, " ").trim()));
    cierto("Carla y Beto empatan en puntos y los separa el Buchholz", comp.length === 2 && comp[0].includes("empatan") && comp[1].includes("4,5 contra 3,5") && comp[1].includes("queda delante Quesada Rojas Carla"), comp.join(" | "));
    cierto("sin errores de la página", errores.length === 0, errores.join("; "));
    await ctx.close();
  }

  // ---- 2. Todos contra todos ----
  console.log("Un todos contra todos");
  {
    pedidos.length = 0;
    const { ctx, page, errores } = await abrir("?t=" + encodeURIComponent("https://chess-results.com/tnr1002.aspx"));
    await page.waitForFunction(() => document.getElementById("rd-resultado").checkVisibility(), null, { timeout: 15000 });
    cierto("el enlace ?t= abre el torneo solo", true);
    cierto("pide el cuadro y los emparejamientos (art=4 y art=2)", pedidos.map((p) => p.art).join(",") === "4,2", JSON.stringify(pedidos));
    cierto("dice todos contra todos y 3 rondas", (await textoDe(page, "#rd-subtitulo")).startsWith("Todos contra todos · 4 jugadores · 3 rondas"));
    const criterios = await page.$$eval("#rd-criterios li", (ls) => ls.map((l) => l.textContent.replace(/\s+/g, " ").trim()));
    cierto("puntos, encuentro directo y Sonneborn-Berger coinciden con chess-results", criterios[0].includes("Coinciden") && criterios[1].includes("(DE)") && criterios[1].includes("en los 4") && criterios[2].includes("(SB)") && criterios[2].includes("en los 4"), criterios.join(" | "));
    await page.selectOption("#rd-a", "2");
    await page.selectOption("#rd-b", "3");
    await page.click("#rd-comparar");
    const comp = await page.$$eval("#rd-comparacion li", (ls) => ls.map((l) => l.textContent.replace(/\s+/g, " ").trim()));
    cierto("Iris y Gina: empatan en puntos y los separa el encuentro directo", comp.length === 2 && comp[1].startsWith("Encuentro directo: 1 contra 0") && comp[1].includes("Rojas Vega, Iris"), comp.join(" | "));
    await page.click("button.rd-explicar[data-id='2']");
    const de = await page.$$eval("#rd-detalle .rd-criterio:nth-child(2) li", (ls) => ls.map((l) => l.textContent.trim()));
    cierto("el encuentro directo de Iris nombra a Gina y la partida con su color", de[0].includes("Soto Ruiz, Gina") && de[1] === "Ronda 3: con negras contra Soto Ruiz, Gina (1)", de.join(" | "));
    cierto("sin errores de la página", errores.length === 0, errores.join("; "));
    await ctx.close();
  }

  console.log("Empatados en círculo");
  {
    const { ctx, page, errores } = await abrir();
    await leer(page, "https://chess-results.com/tnr1005.aspx");
    const criterios = await page.$$eval("#rd-criterios li", (ls) => ls.map((l) => l.textContent.replace(/\s+/g, " ").trim()));
    cierto("el encuentro directo que no separa (1, 1, 1) coincide con el 0 de chess-results", criterios[1] && criterios[1].includes("Coincide con chess-results en los 4"), criterios[1]);
    cierto("y no se marca como distinto", (await page.$$("#rd-tabla td.rd-distinto")).length === 0);
    await page.click("button.rd-explicar[data-id='1']");
    cierto("la explicación dice que no separa al grupo", (await textoDe(page, "#rd-detalle .rd-criterio:nth-child(2)")).includes("no separa a este grupo"));
    await page.selectOption("#rd-a", "1");
    await page.selectOption("#rd-b", "2");
    await page.click("#rd-comparar");
    const comp = await page.$$eval("#rd-comparacion li", (ls) => ls.map((l) => l.textContent.replace(/\s+/g, " ").trim()));
    cierto("al comparar, empatan en puntos, en el encuentro directo y en las victorias", comp.length === 3 && comp.every((x) => x.includes("empatan")), comp.join(" | "));
    cierto("y dice que lo decide el reglamento", (await textoDe(page, "#rd-comparacion")).includes("desempate rápido o un sorteo"));
    cierto("sin errores de la página", errores.length === 0, errores.join("; "));
    await ctx.close();
  }

  // ---- 3. Lo que no se puede ----
  console.log("Lo que no se puede leer");
  {
    const { ctx, page, errores } = await abrir();
    await leer(page, "https://chess-results.com/tnr1003.aspx");
    cierto("un torneo por equipos da un aviso claro", (await textoDe(page, "#rd-estado")).includes("Los torneos por equipos todavía no"), await textoDe(page, "#rd-estado"));
    await leer(page, "https://chess-results.com/tnr1004.aspx");
    cierto("el freno de la función se dice tal cual", (await textoDe(page, "#rd-estado")).startsWith("Llegaron demasiados envíos"));
    cierto("y el resultado no se ve", !(await page.$eval("#rd-resultado", (n) => n.checkVisibility())));
    cierto("sin errores de la página", errores.length === 0, errores.join("; "));
    await ctx.close();
  }

  // ---- 4. Celular y modo oscuro ----
  console.log("Celular y modo oscuro");
  {
    const { ctx, page } = await abrir("?t=" + encodeURIComponent("https://chess-results.com/tnr1001.aspx"), { viewport: { width: 400, height: 800 } });
    await page.waitForFunction(() => document.getElementById("rd-resultado").checkVisibility(), null, { timeout: 15000 });
    await page.click("button.rd-explicar[data-id='1']");
    const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
    cierto("a 400 px no hay desplazamiento horizontal", ancho <= 400, "scrollWidth " + ancho);
    await ctx.close();
    const o = await abrir("", { colorScheme: "dark" });
    const fondo = await o.page.$eval(".ae-tarjeta", (n) => getComputedStyle(n).backgroundColor);
    cierto("en modo oscuro la tarjeta no queda blanca", fondo !== "rgb(255, 255, 255)", fondo);
    await o.ctx.close();
  }

  await browser.close();
  console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : "\nTodo bien");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
