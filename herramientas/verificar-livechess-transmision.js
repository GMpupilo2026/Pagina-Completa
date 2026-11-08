#!/usr/bin/env node
/* Verifica el Blitz del Centroamericano directo de LiveChess, sin atraso
 * (js/livechess-transmision.js y su enchufe en js/centroamericano-partidas.js).
 * Ver «El Blitz, directo de LiveChess y sin atraso» en
 * docs/decisiones/juegos-y-torneos.md.
 *
 *   1. El lector, con node: una ronda de verdad de LiveChess (la 3 del Sub-10
 *      del clásico, con los nombres cambiados y sin los ID de FIDE: son menores
 *      de edad; herramientas/datos/livechess-prueba/), con la mesa 5 dejada
 *      «en juego». Las jugadas que salen son las de LiveChess, jugada a jugada,
 *      con su reloj; el resultado, el nombre «Apellidos, Nombre», la ronda de
 *      ahora y que una partida terminada no se vuelve a pedir.
 *   2. La página: LiveChess publica una categoría que Lichess también transmite
 *      (Sub-15 Femenino). Sale una sola vez, de LiveChess: a Lichess no se le
 *      pide esa ronda. Con la federación y el Elo de chess-results, la que se
 *      juega dice «En juego» y el visor tiene sus jugadas.
 *
 * Uso: node herramientas/verificar-livechess-transmision.js (con el sitio en el 8777).
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { Chess } = require("chess.js");
const RAIZ = path.join(__dirname, "..");
const DATOS = path.join(__dirname, "datos", "livechess-prueba");
const BASE = process.env.BASE || "http://localhost:8777";
const CHROME = "/opt/pw-browsers/chromium";
const LC = require(path.join(RAIZ, "js", "livechess-transmision.js"));

let fallas = 0;
function ok(nombre, cond, detalle) {
  console.log((cond ? "  ✓ " : "  ✗ ") + nombre + (cond || detalle === undefined ? "" : "\n      " + String(detalle).slice(0, 600)));
  if (!cond) fallas++;
}
const leer = (f) => JSON.parse(fs.readFileSync(path.join(DATOS, f), "utf8"));
const ID_LC = "00000000-0000-4000-8000-000000000001";

// Un «LiveChess» de mentira para node: sirve los archivos y cuenta los pedidos.
const pedidos = [];
global.fetch = async (url) => {
  const u = String(url);
  pedidos.push(u.replace(LC.POOL + ID_LC + "/", ""));
  const m = u.match(/\/(tournament\.json|round-(\d+)\/(index\.json|game-(\d+)\.json))/);
  let cuerpo = null;
  if (m && m[1] === "tournament.json") cuerpo = leer("tournament.json");
  else if (m && m[2] === "3") cuerpo = m[3] === "index.json" ? leer("index.json") : leer("game-" + m[4] + ".json");
  return { ok: !!cuerpo, status: cuerpo ? 200 : 404, json: async () => cuerpo };
};

(async () => {
  console.log("1. El lector de LiveChess");
  const sb = { rpc: async (f) => ({ error: null, data: f === "centroamericano_livechess_publico"
    ? [{ tnr: "1535077", nombre: "BLITZ U14", categoria: "Sub-14", rama: "Absoluto", ritmo: "blitz", torneo_id: ID_LC, tableros: "1-10" },
       { tnr: "999", nombre: "sin id", categoria: "Sub-8", rama: "Absoluto", ritmo: "blitz", torneo_id: "nada", tableros: "" }] : null }) };
  const ts = await LC.torneos(sb);
  ok("los torneos publicados, con un nombre que la página entiende («Blitz Sub-14 Absoluto»), y sin el que no tiene un id de LiveChess",
     ts.length === 1 && ts[0].id === "lc-1535077" && ts[0].nombre === "Blitz Sub-14 Absoluto", JSON.stringify(ts));
  ok("los ids son nuestros (lc-<tnr>), no los de LiveChess", LC.es("lc-1535077") && LC.es("lc-1535077-3") && !LC.es("OlpxXUwD") && !LC.es(ID_LC));

  const r = await LC.rondas("lc-1535077");
  ok("las 9 rondas, y la de ahora es la 3, que tiene una partida en vivo",
     r.rondas.length === 9 && r.porDefecto === "lc-1535077-3" && r.rondas[2].enCurso && r.rondas[1].terminada && !r.rondas[2].terminada && !r.rondas[3].terminada, JSON.stringify(r).slice(0, 400));

  const juegos = await LC.juegos("lc-1535077-3", Chess);
  const idx = leer("index.json");
  ok("las 5 partidas, una por tablero, con su mesa y su id", juegos.length === 5 && juegos.map((g) => g.mesa).join() === "1,2,3,4,5" && juegos[4].id === "lc-1535077-3-5", JSON.stringify(juegos.map((g) => g.id)));
  const todas = juegos.every((g, i) => g.jugadas.length === leer("game-" + (i + 1) + ".json").moves.length);
  ok("cada jugada de LiveChess entra, jugada a jugada (ninguna partida se corta)", todas, JSON.stringify(juegos.map((g) => g.jugadas.length)));
  // Las mismas jugadas, con chess.js aparte: la posición final coincide.
  const fin = (i) => { const c = new Chess(); leer("game-" + i + ".json").moves.forEach((m) => c.move(m.split(" ")[0], { sloppy: true })); return c.fen(); };
  ok("y la posición que deja cada una es la de esas jugadas", juegos.every((g, i) => g.jugadas[g.jugadas.length - 1].fen === fin(i + 1)));
  const j0 = juegos[0].jugadas[0];
  ok("con el reloj de quien jugó (en segundos) y lo que pensó", j0.san === "d4" && j0.reloj === 5456 && j0.piensa === 5, JSON.stringify(j0));
  ok("el resultado de LiveChess («0-1», «1-0»), y la que se juega, sin resultado",
     juegos.map((g) => g.resultado).join() === "0-1,1-0,0-1,0-1," && juegos[0].tags.Result === "0-1" && juegos[4].tags.Result === "*", JSON.stringify(juegos.map((g) => g.resultado)));
  ok("el nombre como lo escriben FIDE y chess-results: «Apellidos, Nombre Segundo»",
     juegos[0].blancas.nombre === "Mora Vargas, Ana Lucia" && juegos[0].negras.nombre === "Rojas Solano, Sofia", JSON.stringify([juegos[0].blancas, juegos[0].negras]));
  ok("LiveChess no trae evaluación: ninguna se inventa", juegos.every((g) => g.jugadas.every((j) => j.eval === null)));
  ok("jugadaDe entiende las tres formas («Nf3 5482+5», «Ba6 2912», «e4 +152»)",
     JSON.stringify([LC.jugadaDe("Nf3 5482+5"), LC.jugadaDe("Ba6 2912"), LC.jugadaDe("e4 +152"), LC.jugadaDe("O-O")]) ===
     JSON.stringify([{ san: "Nf3", reloj: 5482, piensa: 5 }, { san: "Ba6", reloj: 2912, piensa: null }, { san: "e4", reloj: null, piensa: 152 }, { san: "O-O", reloj: null, piensa: null }]));
  ok("el resultado: del pareo, y si no lo trae, de la partida", LC.resultadoDe({ result: "1/2-1/2" }) === "½-½" && LC.resultadoDe({}, { result: "WHITEWIN" }) === "1-0" && LC.resultadoDe(null, { result: null }) === "");

  pedidos.length = 0;
  await new Promise((h) => setTimeout(h, 4100));
  const ps = await LC.partidas("lc-1535077-3", Chess);
  ok("al volver a leer, las partidas terminadas no se piden otra vez (solo el índice y la que se juega)",
     JSON.stringify(pedidos) === JSON.stringify(["round-3/index.json", "round-3/game-5.json?poll"]), JSON.stringify(pedidos));
  const p5 = ps[4];
  ok("la partida como la da Lichess: la posición, la última jugada (de dónde a dónde) y los relojes en centésimas",
     p5.fen === juegos[4].jugadas[20].fen && /^[a-h][1-8][a-h][1-8]$/.test(p5.ultima) && p5.blancas.reloj === 498000 && p5.negras.reloj === 501100 && p5.resultado === "", JSON.stringify(p5));
  ok("sin el reloj de la partida, el de la última jugada de cada uno", JSON.stringify(LC.relojes(null, juegos[0].jugadas)) === JSON.stringify({
    b: juegos[0].jugadas.filter((j) => j.color === "w").pop().reloj * 100, n: juegos[0].jugadas.filter((j) => j.color === "b").pop().reloj * 100 }));

  // Ningún id de LiveChess de verdad en el código: lo da la base.
  const codigo = fs.readFileSync(path.join(RAIZ, "js", "livechess-transmision.js"), "utf8") + fs.readFileSync(path.join(RAIZ, "js", "centroamericano-partidas.js"), "utf8");
  ok("el código no lleva ningún id de LiveChess (lo da centroamericano_livechess_publico)", !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(codigo));
  const mig = fs.readdirSync(path.join(RAIZ, "supabase", "migraciones")).filter((f) => /livechess_publico/.test(f)).map((f) => fs.readFileSync(path.join(RAIZ, "supabase", "migraciones", f), "utf8")).join("");
  ok("la base publica solo lo marcado (publico), sin los de prueba ni los archivados, y lo puede pedir cualquiera",
     /where l\.publico and not t\.prueba and not t\.archivado/.test(mig) && /grant execute on function public\.centroamericano_livechess_publico\(\) to anon, authenticated/.test(mig) && /publico boolean not null default false/.test(mig));
  const h = fs.readFileSync(path.join(RAIZ, "_headers"), "utf8");
  ok("la CSP deja al navegador leer LiveChess", /connect-src[^;\n]*https:\/\/1\.pool\.livechesscloud\.com/.test(h));
  const pag = fs.readFileSync(path.join(RAIZ, "centroamericano-2026.html"), "utf8");
  ok("la página carga el lector antes de las partidas", pag.indexOf('src="js/livechess-transmision.js"') > 0 && pag.indexOf('src="js/livechess-transmision.js"') < pag.indexOf('src="js/centroamericano-partidas.js"'));

  console.log("2. La página");
  let chromium;
  try { ({ chromium } = require("playwright")); } catch (e) { ok("playwright", false, e.message); return fin2(); }
  const nav = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  const errores = [];
  try {
    const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
    const deLichess = [], deLc = [];
    // Lichess: el grupo de prueba (Girls U15), el mismo de verificar-centroamericano-partidas.js.
    const L = path.join(__dirname, "datos", "lichess-prueba");
    const TORNEO = JSON.parse(fs.readFileSync(path.join(L, "torneo.json"), "utf8"));
    await ctx.route("https://lichess.org/**", (route) => {
      const u = new URL(route.request().url());
      deLichess.push(u.pathname);
      const json = (d) => route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(d) });
      // Solo Girls U15 tiene rondas (como en la otra prueba): si la página le
      // pidiera a Lichess esa categoría, se notaría en sus rondas.
      const m = u.pathname.match(/^\/api\/broadcast\/([A-Za-z0-9]{8})$/);
      const t = m && TORNEO.group.tours.find((x) => x.id === m[1]);
      if (t) return json(Object.assign({}, TORNEO, { tour: Object.assign({}, TORNEO.tour, { id: t.id, name: t.name }), rounds: t.id === TORNEO.tour.id ? TORNEO.rounds : [] }));
      return route.fulfill({ status: 404, body: "" });
    });
    await ctx.route("https://1.pool.livechesscloud.com/**", (route) => {
      const u = new URL(route.request().url());
      deLc.push(u.pathname);
      const m = u.pathname.match(/\/(tournament\.json|round-3\/(index\.json|game-(\d)\.json))$/);
      if (!m) return route.fulfill({ status: 404, body: "" });
      const f = m[1] === "tournament.json" ? "tournament.json" : m[2] === "index.json" ? "index.json" : "game-" + m[3] + ".json";
      return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: fs.readFileSync(path.join(DATOS, f), "utf8") });
    });
    await ctx.addInitScript((id) => {
      const enlaces = [{ texto: "Partidas en vivo", url: "https://lichess.org/broadcast/sudamericano-g15/OlpxXUwD" }];
      const fila = (t) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: t === "salas_torneo" ? { enlaces } : null, error: null }),
        is: () => ({ gt: () => ({ order: async () => ({ data: [], error: null }) }) }) }) }) });
      window.sb = { from: fila,
        rpc: async (f) => ({ error: null, data: f === "centroamericano_livechess_publico" ? [{ tnr: "1529766", nombre: "Sub-15 Femenino", categoria: "Sub-15", rama: "Femenino", ritmo: "clasico", torneo_id: id, tableros: "1-5" }] : null }),
        functions: { invoke: async () => ({ error: null, data: { modalidad: "clasico", modalidades: ["clasico"], torneos: [{ tnr: "1529766", url: "x", categoria: "U15F", ronda: 3, rondas: 9,
          jugadores: [
            { puesto: 1, no: 1, titulo: "", nombre: "Mora Vargas, Ana Lucia", fed: "CRC", elo: 1433, grupo: "U15F", puntos: "2" },
            { puesto: 2, no: 2, titulo: "WCM", nombre: "Rojas Solano, Sofia", fed: "GUA", elo: 1864, grupo: "U15F", puntos: "2" },
          ], pareo: { ronda: 3, mesas: [{ mesa: 1, blancas: { no: 1, titulo: "", nombre: "Mora Vargas, Ana Lucia" }, negras: { no: 2, titulo: "WCM", nombre: "Rojas Solano, Sofia" }, resultado: "0-1" }] } }] } }) } };
    }, ID_LC);
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errores.push(String(e)));
    await p.goto(BASE + "/centroamericano-2026.html", { waitUntil: "load" });
    // Que lleguen los datos de chess-results (la federación y el Elo salen de ahí).
    await p.evaluate(() => window.CentroamericanoVivo && window.CentroamericanoVivo.pedir && window.CentroamericanoVivo.pedir());
    await p.waitForFunction(() => window.CentroamericanoVivo.datos(), null, { timeout: 8000 }).catch(() => {});
    await p.waitForFunction(() => { const f = document.getElementById("ficha-partidas"); return f && f.tagName === "A"; }, null, { timeout: 8000 }).catch(() => {});
    await p.click("#ficha-partidas");
    await p.waitForFunction(() => document.querySelectorAll("#partidas-contenido .cac-partida").length > 0, null, { timeout: 8000 }).catch(() => {});
    const lista = await p.evaluate(() => ({
      n: document.querySelectorAll("#partidas-contenido .cac-partida").length,
      cabezas: [...document.querySelectorAll("#partidas-contenido .cac-partida-cabeza")].map((e) => e.textContent),
      tableros: [...document.querySelectorAll("#partidas-contenido .cac-partida-tablero")].map((t) => t.querySelectorAll(".cine-sq").length),
      vivo: [...document.querySelectorAll("#partidas-contenido .cac-partida-resultado")].map((e) => e.textContent),
      primera: (document.querySelector("#partidas-contenido .cac-partida") || {}).innerText || "",
      estado: (document.querySelector("#partidas-contenido [data-estado]") || {}).textContent || "",
      enlacesAfuera: [...document.querySelectorAll("#partidas a[href]")].filter((a) => /^https?:/.test(a.getAttribute("href"))).length,
    }));
    ok("la categoría que publica LiveChess sale de LiveChess: las 5 mesas de la ronda 3, cada una con su tablero",
       lista.n === 5 && lista.cabezas[0] === "Sub-15 Femenino · Ronda 3 · Mesa 1" && lista.tableros.every((n) => n === 64), JSON.stringify(lista));
    ok("y una sola vez: a Lichess no se le pidió ninguna ronda de esa categoría", deLichess.filter((x) => x === "/api/broadcast/" + TORNEO.tour.id).length === 1 && !deLichess.some((x) => /\/-\/-\/|\.pgn$/.test(x)) && deLc.includes("/get/" + ID_LC + "/round-3/index.json"), JSON.stringify([deLichess, deLc]));
    ok("el resultado escrito, y la que se juega dice «En juego»", lista.vivo.join() === "0-1,1-0,0-1,0-1,En juego", JSON.stringify(lista.vivo));
    ok("con la federación y el Elo de chess-results (LiveChess no los trae)", /Mora Vargas, Ana Lucia[\s\S]*CRC[\s\S]*1433/.test(lista.primera) && /GUA[\s\S]*1864/.test(lista.primera), lista.primera);
    ok("arriba dice la ronda y cuántas se juegan, sin nombrar a Lichess", /^Ronda 3 · 5 partidas transmitidas · 1 en juego\. Leído a las/.test(lista.estado), lista.estado);
    ok("ningún enlace saca de la página", lista.enlacesAfuera === 0);
    // El visor: la que se juega, con sus 21 jugadas y en la última.
    await p.click("#partidas-contenido .cac-partida:nth-child(5) .cac-partida-abrir");
    await p.waitForFunction(() => document.querySelectorAll("#partidas-contenido .cac-visor-jugada").length > 0, null, { timeout: 8000 }).catch(() => {});
    const visor = await p.evaluate(() => ({ jugadas: document.querySelectorAll("#partidas-contenido .cac-visor-jugada").length,
      cabeza: (document.querySelector("#partidas-contenido [data-cabeza]") || {}).textContent || "" }));
    ok("el visor abre la partida en juego con sus 21 jugadas", visor.jugadas === 21 && /Mesa 5/.test(visor.cabeza), JSON.stringify(visor));
    ok("sin errores en la página", !errores.length, errores.join(" | "));
    await ctx.close();
  } finally {
    await nav.close();
  }
  fin2();
})().catch((e) => { console.error(e); process.exit(1); });

function fin2() {
  console.log(fallas ? "\n✗ " + fallas + " comprobación(es) fallaron." : "\n✓ Todo bien.");
  process.exit(fallas ? 1 : 0);
}

/*! rev bfb5bbb0d2d82f9f */
