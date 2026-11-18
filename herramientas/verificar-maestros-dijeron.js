/* «100 maestros dijeron» (maestros-dijeron.html, js/maestros-dijeron.js).
 *
 *   1. LAS CUENTAS (en Node): cada apertura de la lista se juega con chess.js
 *      (ninguna posición se inventa); el peso de cada jugada sale del total
 *      de partidas de la posición; lo que dice el equipo se entiende en
 *      español y en inglés (Cf3 = Nf3, O-O = 0-0, la R es el Rey); acertar
 *      suma el peso al equipo de turno, repetir no suma, el tercer fallo pasa
 *      el turno; el podio comparte puesto en un empate.
 *   2. LA PÁGINA (en el navegador, con el marcado de maestros-dijeron.html y
 *      un doble de la Edge Function): solo para quien da clase; el tablero se
 *      dibuja con sus 32 piezas y dice su posición en texto; las respuestas
 *      empiezan escondidas; acertar la destapa con «N de cada 100» y suma al
 *      marcador; sin el token de Lichess, lo dice.
 *   3. EL CABLEADO: la página está registrada en la cabecera de la Academia
 *      (con sus migas) y se llega desde Cuestionarios.
 *
 * Uso:  node herramientas/verificar-maestros-dijeron.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
require("./lib/navegador-local");

const RAIZ = path.join(__dirname, "..");
const M = require(path.join(RAIZ, "js", "maestros-dijeron.js"));
const { Chess } = require("chess.js");

let fallos = 0;
function ok(cond, msg, detalle) {
  if (cond) console.log("  ✓ " + msg);
  else { console.log("  ✗ " + msg + (detalle !== undefined ? "\n      salió: " + JSON.stringify(detalle) : "")); fallos++; }
}

console.log("Las cuentas:");
{
  const malas = M.APERTURAS.filter((a) => !M.posicion(Chess, a.jugadas));
  ok(malas.length === 0, "las " + M.APERTURAS.length + " aperturas se juegan con chess.js", malas.map((a) => a.nombre));
  const esp = M.posicion(Chess, ["e4", "e5", "Nf3", "Nc6", "Bb5"]);
  ok(esp.linea === "1.e4 e5 2.Cf3 Cc6 3.Ab5" && esp.turno === "b", "la línea va en español y dice a quién le toca", esp);
  ok(M.posicion(Chess, ["e4", "e4"]) === null, "una línea que no se puede jugar no da posición");
  const r = M.respuestas({ w: 500, d: 300, b: 200, jugadas: [
    { san: "a6", w: 300, d: 150, b: 70 }, { san: "Nf6", w: 150, d: 100, b: 100 }, { san: "f5", w: 1, d: 1, b: 1 },
    { san: "Bc5", w: 40, d: 40, b: 20 }, { san: "g6", w: 9, d: 0, b: 0 } ] });
  ok(JSON.stringify(r.map((x) => [x.san, x.pct])) === JSON.stringify([["a6", 52], ["Nf6", 35], ["Bc5", 10]]),
    "el peso sale del total de la posición, de mayor a menor, sin las de menos de 1 de cada 100", r);
  ok(M.respuestas({ w: 0, d: 0, b: 0, jugadas: [] }).length === 0, "una posición sin partidas no da respuestas");
  ok(M.coincide("Cf3", "Nf3") && M.coincide("nf3", "Nf3") === false, "Cf3 es Nf3 (la pieza va en mayúscula)");
  ok(M.coincide("Ab5", "Bb5") && M.coincide("Bb5", "Bb5"), "Ab5 y Bb5 son la misma");
  ok(M.coincide("0-0", "O-O") && M.coincide("o-o", "O-O") && !M.coincide("O-O-O", "O-O"), "los enroques, con cero o con O");
  ok(M.coincide("cxd4", "cxd4") && M.coincide("cd4", "cxd4") && M.coincide("Cxd4+", "Nxd4"), "sin importar la x ni el jaque");
  ok(M.coincide("Rf1", "Kf1") && !M.coincide("Rf1", "Rf1"), "la R es el Rey, como se escribe acá");
  ok(M.coincide("Td1", "Rd1") && M.coincide("Dh5", "Qh5"), "T es la torre y D la dama");
  ok(M.sanEs("Nxd4") === "Cxd4" && M.sanEs("Kf1") === "Rf1" && M.sanEs("Rd1") === "Td1", "se muestra en español");

  const j = M.nuevoJuego(["Peones", "Torres"]);
  M.nuevaRonda(j, { nombre: "x" }, { fen: "f", turno: "w", linea: "" }, [{ san: "e4", pct: 45 }, { san: "d4", pct: 40 }, { san: "Nf3", pct: 10 }]);
  ok(JSON.stringify(M.adivinar(j, "d4")) === JSON.stringify({ tipo: "acierto", indice: 1, puntos: 40 }) && j.equipos[0].puntos === 40, "acertar suma su peso al equipo de turno");
  ok(M.adivinar(j, "d4").tipo === "repetida" && j.equipos[0].puntos === 40, "repetir una que ya salió no suma");
  ok(M.adivinar(j, "h4").tipo === "fallo" && M.adivinar(j, "a4").tipo === "fallo", "fallar suma un fallo");
  const pasa = M.adivinar(j, "b4");
  ok(pasa.tipo === "pasa" && pasa.a === 1 && j.ronda.fallos === 0, "el tercer fallo pasa el turno y los fallos vuelven a cero", pasa);
  ok(M.adivinar(j, "Cf3").puntos === 10 && j.equipos[1].puntos === 10, "y el equipo siguiente suma lo suyo");
  M.cerrarRonda(j);
  ok(j.ronda.reveladas.length === 3 && j.turno === 0 && j.jugadas === 1, "cerrar la ronda muestra todas y la siguiente la empieza el otro equipo");
  const p = M.podio([{ nombre: "A", puntos: 50 }, { nombre: "B", puntos: 80 }, { nombre: "C", puntos: 50 }]);
  ok(JSON.stringify(p.map((x) => [x.nombre, x.puesto])) === JSON.stringify([["B", 1], ["A", 2], ["C", 2]]), "un empate comparte puesto");
}

console.log("El cableado:");
{
  const cab = fs.readFileSync(path.join(RAIZ, "herramientas", "academia-cabecera.py"), "utf8");
  ok(/"maestros-dijeron\.html", "cuestionario-tarea\.html"/.test(cab) && /"maestros-dijeron\.html": \("100 maestros dijeron", "cuestionarios\.html"\)/.test(cab),
    "está en la cabecera de la Academia, colgando de Cuestionarios");
  const html = fs.readFileSync(path.join(RAIZ, "maestros-dijeron.html"), "utf8");
  ok(/<!-- guardia: inicio -->/.test(html) && /aria-current="page"[^>]*>100 maestros dijeron</.test(html), "lleva la guardia de sesión y sus migas");
  const orden = ["js/vendor/chess.js", "js/chess-piece-svg.js", "js/maestros-dijeron.js", "js/maestros-dijeron-pagina.js"].map((s) => html.indexOf('src="' + s + '"'));
  ok(orden.every((x, i) => x > 0 && (i === 0 || x > orden[i - 1])), "carga chess.js, las piezas, la cuenta y la página, en ese orden", orden);
  ok(!/<script>(?![\s\S]*?(guardia|oscuro|tema))/.test(html.replace(/<!-- (guardia|oscuro|tema): inicio -->[\s\S]*?<!-- \1: fin -->/g, "")), "sin código escrito dentro de la página");
  const cu = fs.readFileSync(path.join(RAIZ, "cuestionarios.html"), "utf8");
  ok(/href="maestros-dijeron\.html"/.test(cu), "se llega desde Cuestionarios");
}

async function pagina() {
  console.log("La página:");
  const html = fs.readFileSync(path.join(RAIZ, "maestros-dijeron.html"), "utf8");
  const main = html.match(/<main[\s\S]*?<\/main>/)[0];
  const css = fs.readFileSync(path.join(RAIZ, "css", "tailwind.css"), "utf8");
  const scripts = ["js/vendor/chess.js", "js/chess-piece-svg.js", "js/maestros-dijeron.js"].map((s) => fs.readFileSync(path.join(RAIZ, s), "utf8"));
  const pag = fs.readFileSync(path.join(RAIZ, "js", "maestros-dijeron-pagina.js"), "utf8");
  const browser = await chromium.launch();

  async function abrir(perfil, motivo) {
    const page = await browser.newPage();
    const errores = [];
    page.on("pageerror", (e) => errores.push(String(e)));
    await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body>${main}</body></html>`);
    await page.evaluate(({ perfil, motivo }) => {
      window.__pedidos = [];
      window.Avisos = { confirmar: async () => true };
      window.sb = {
        auth: { getSession: async () => ({ data: { session: { user: { id: "u1" } } } }) },
        from: () => ({ select() { return this; }, eq() { return this; }, single: async () => ({ data: perfil, error: null }) }),
        functions: { invoke: async (n, o) => {
          window.__pedidos.push([n, o.body.fens]);
          if (motivo) return { data: { posiciones: {}, faltan: o.body.fens, motivo }, error: null };
          const datos = { w: 500, d: 300, b: 200, jugadas: [
            { san: "e4", w: 250, d: 150, b: 100 }, { san: "d4", w: 150, d: 100, b: 50 },
            { san: "Nf3", w: 80, d: 40, b: 30 }, { san: "c4", w: 20, d: 10, b: 20 } ] };
          return { data: { posiciones: { [o.body.fens[0]]: datos }, faltan: [], motivo: null }, error: null };
        } },
      };
    }, { perfil, motivo: motivo || null });
    for (const s of scripts) await page.addScriptTag({ content: s });
    await page.addScriptTag({ content: pag });
    return { page, errores };
  }

  {
    const { page } = await abrir({ role: "alumno", is_admin: false });
    await page.waitForFunction(() => !document.getElementById("app").classList.contains("hidden"));
    ok(await page.$eval("#sin-permiso", (n) => n.checkVisibility()) && !(await page.$eval("#armar", (n) => n.checkVisibility())), "a un alumno no le arma el juego");
    await page.close();
  }

  const { page, errores } = await abrir({ role: "profesor", is_admin: false });
  await page.waitForFunction(() => document.getElementById("armar").checkVisibility());
  await page.fill("#equipo-0", "Los <b>Peones</b>");
  await page.click("#empezar");
  await page.waitForFunction(() => document.querySelectorAll("#respuestas li").length === 4);
  ok((await page.$$("#tablero > div")).length === 64, "el tablero tiene sus 64 casillas");
  const piezas = await page.$$eval("#tablero svg", (s) => s.length);
  ok(piezas >= 20 && piezas <= 32, "y las piezas de la posición", piezas);
  ok(/^Posición después de .*Juegan (blancas|negras)\.$|^Posición después de ninguna jugada/.test(await page.getAttribute("#tablero", "aria-label")), "la posición se dice en texto (para el lector)", await page.getAttribute("#tablero", "aria-label"));
  ok((await page.$$eval("#respuestas li", (l) => l.map((x) => x.textContent))).every((t) => /\?$/.test(t)), "las respuestas empiezan escondidas");
  const pedido = await page.evaluate(() => window.__pedidos[0]);
  ok(pedido[0] === "explorador-maestros" && pedido[1].length === 1 && pedido[1][0].split(" ").length === 4, "pide UNA posición al explorador, sin los contadores de jugadas", pedido);
  await page.fill("#adivinar-texto", "Cf3");
  await page.click('#adivinar button[type="submit"]');
  const destapada = await page.$eval('#respuestas li[data-respuesta="2"]', (li) => li.innerText.replace(/\s+/g, " ").trim());
  ok(destapada === "3. Cf3 15 de cada 100", "acertar la destapa, en español, con «de cada 100»", destapada);
  ok(/Los <b>Peones<\/b>: 15 pts/.test(await page.textContent("#marcador")) && (await page.$$("#marcador b")).length === 0, "y suma al marcador (el nombre va como texto)", await page.textContent("#marcador"));
  for (const t of ["h4", "a4", "b4"]) { await page.fill("#adivinar-texto", t); await page.click('#adivinar button[type="submit"]'); }
  ok(/Equipo 2: 15|Equipo 2: 0 pts · le toca/.test(await page.textContent("#marcador")), "con tres fallos le toca al otro equipo", await page.textContent("#marcador"));
  await page.click("#mostrar-todas");
  ok((await page.$$eval("#respuestas li", (l) => l.map((x) => x.textContent))).every((t) => /de cada 100$/.test(t)), "«Mostrar todas» las destapa");
  ok(await page.evaluate(() => document.activeElement && document.activeElement.id) === "siguiente", "y el foco va a «Siguiente posición»");
  ok(errores.length === 0, "sin errores en la página", errores);
  await page.close();

  {
    const { page } = await abrir({ role: "profesor", is_admin: false }, "sin_token");
    await page.waitForFunction(() => document.getElementById("armar").checkVisibility());
    await page.click("#empezar");
    await page.waitForFunction(() => /token de Lichess/.test(document.getElementById("ronda-titulo").textContent));
    ok(!(await page.$eval("#adivinar", (n) => n.checkVisibility())), "sin el token de Lichess lo dice y no deja jugar a ciegas");
    await page.close();
  }
  await browser.close();
}

pagina().then(() => {
  if (fallos) { console.log("\n✗ " + fallos + " comprobación(es) fallaron."); process.exit(1); }
  console.log("\n✓ Todo bien.");
}).catch((e) => { console.error(e); process.exit(1); });

/*! rev bfb5bbb0d2d82f9f */
