/* Las partidas en vivo de Lichess en la página del Centroamericano 2026
 * (js/centroamericano-partidas.js, js/lichess-transmision.js, js/tablero-fen.js).
 *
 * Lo que se rompe acá no da error: una jugada que no se lee y la partida se
 * corta callada, la barra que muestra la ventaja al revés, el botón «Ver su
 * partida» que lleva a la partida de otro, o las jugadas nuevas que se comen
 * la que alguien estaba mirando. Dos partes:
 *
 *   1. CON NODE: el PGN de una ronda de verdad de Lichess (de una transmisión
 *      juvenil, con los nombres cambiados: herramientas/datos/lichess-prueba/)
 *      se lee entero, con la evaluación y el reloj de cada jugada; los enlaces
 *      de Lichess se reconocen; y la categoría y la modalidad del nombre de
 *      un torneo salen igual que en la función sala-jugadores.
 *   2. LA PÁGINA, con Lichess y Supabase de mentira (las mismas respuestas
 *      que da Lichess, servidas por el navegador de la prueba): la ficha se
 *      enciende, la lista y sus filtros, el visor jugada por jugada (botones,
 *      teclado, girar, la barra, el gráfico), las jugadas que llegan en vivo,
 *      y el botón en la tarjeta del jugador.
 *
 *   python3 -m http.server 8777     (desde la raíz del sitio)
 *   node herramientas/verificar-centroamericano-partidas.js
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const PAGINA = "centroamericano-2026.html";
const DATOS = path.join(__dirname, "datos", "lichess-prueba");
const TORNEO = JSON.parse(fs.readFileSync(path.join(DATOS, "torneo.json"), "utf8"));
const RONDA = JSON.parse(fs.readFileSync(path.join(DATOS, "ronda.json"), "utf8"));
const PGN = fs.readFileSync(path.join(DATOS, "ronda.pgn"), "utf8");
const L = require(path.join(RAIZ, "js", "lichess-transmision.js"));
const { Chess } = require(path.join(RAIZ, "js", "vendor", "chess.js"));

let fallos = 0;
function ok(nombre, cond, detalle) {
  if (cond) console.log("  ✓ " + nombre);
  else { fallos++; console.log("  ✗ " + nombre + (detalle ? " — " + detalle : "")); }
}

console.log("1. Lo que se lee de Lichess");
const juegos = L.leerPgn(PGN, Chess);
ok("el PGN de la ronda trae sus 6 partidas, cada una con su id y su mesa", juegos.length === 6 && juegos.every((g, i) => /^[A-Za-z0-9]{8}$/.test(g.id) && g.mesa === i + 1),
   JSON.stringify(juegos.map((g) => [g.id, g.mesa])));
// Cuántas jugadas tiene cada una, contadas aparte: los números de jugada del PGN.
const cuentas = PGN.split(/\n\s*\n(?=\[)/).filter((b) => /\[Event/.test(b)).map((b) => {
  const cuerpo = b.replace(/^\[.*\]\s*$/gm, "").replace(/\{[^}]*\}/g, "");
  return (cuerpo.match(/(^|\s)(\d+\.(?!\.)|\d+\.\.\.)/g) || []).length;
});
ok("cada partida se lee entera: ninguna jugada se queda afuera", JSON.stringify(juegos.map((g) => g.jugadas.length)) === JSON.stringify(cuentas), JSON.stringify([juegos.map((g) => g.jugadas.length), cuentas]));
const g1 = juegos[0];
ok("con la evaluación y el reloj de cada jugada", g1.jugadas[0].san === "d4" && g1.jugadas[0].eval === 0.15 && g1.jugadas[0].reloj === 56 * 60 + 47 && g1.jugadas[1].reloj === 3600 + 46,
   JSON.stringify(g1.jugadas.slice(0, 2)));
ok("y la posición que deja cada una, comprobada con chess.js", (() => {
  const c = new Chess();
  return g1.jugadas.every((j) => c.move(j.san) && c.fen() === j.fen);
})());
ok("el mate se lee como mate, del lado que es", L.evalDe("[%eval #-3]") === -97 && L.evalDe("[%eval #2]") === 98 && L.evalDe("[%eval -1.5]") === -1.5 && L.evalDe("nada") === null);
ok("el resultado: 1-0, 0-1 y ½-½; en curso, nada", juegos.map((g) => g.resultado).join(",") === "0-1,½-½,0-1,0-1,,1-0", juegos.map((g) => g.resultado).join(","));
ok("una jugada que no se puede hacer corta la partida ahí, sin inventar el resto",
   L.leerPgn('[Event "x"]\n\n1. e4 e5 2. Ke3 Nc6 *', Chess)[0].jugadas.map((j) => j.san).join(" ") === "e4 e5");
ok("las variantes y los comentarios no se cuelan en la línea principal",
   L.leerPgn('[Event "x"]\n\n1. e4 { bien } (1. d4 d5) 1... e5 $1 2. Nf3 *', Chess)[0].jugadas.map((j) => j.san).join(" ") === "e4 e5 Nf3");
ok("los enlaces de Lichess: torneo, ronda y partida; lo demás, nada", JSON.stringify([
  L.idDeEnlace("https://lichess.org/broadcast/centroamericano-2026/AbCd1234"),
  L.idDeEnlace("https://lichess.org/broadcast/centroamericano-2026/ronda-1/XyZw9876"),
  L.idDeEnlace("https://lichess.org/broadcast/centroamericano-2026/ronda-1/XyZw9876/Gm123456"),
  L.idDeEnlace("https://s1.chess-results.com/tnr1529719.aspx"),
  L.idDeEnlace("https://lichess.org/study/AbCd1234")]) === JSON.stringify([{ id: "AbCd1234", es: "torneo" }, { id: "XyZw9876", es: "ronda" }, { id: "XyZw9876", es: "ronda" }, null, null]));
ok("la barra: mitad con 0, más blanco con ventaja de las blancas, llena solo con mate",
   L.porcentaje(0) === 50 && L.porcentaje(1) > 55 && L.porcentaje(1) < 70 && L.porcentaje(-1) < 45 && L.porcentaje(8) < 100 && L.porcentaje(98) === 100 && L.porcentaje(-97) === 0);
ok("la ronda de ahora: la que se juega; si ninguna, la que marca Lichess", (() => {
  const r = { rondas: [{ id: "a", numero: 1, terminada: true }, { id: "b", numero: 2, enCurso: true }, { id: "c", numero: 3 }], porDefecto: "c" };
  const s = { rondas: [{ id: "a", numero: 1, terminada: true }, { id: "c", numero: 2 }], porDefecto: "c" };
  return L.rondaDeAhora(r).id === "b" && L.rondaDeAhora(s).id === "c";
})());

// Lo mejor de la ronda: lo que dice la evaluación de Lichess, uno por partida.
const ms = L.momentos(juegos);
ok("lo mejor de la ronda: la salvada, las dos remontadas y los vuelcos, de más a menos peso",
   ms.map((m) => m.tipo + m.mesa).join(",") === "salvada2,remontada4,remontada3,vuelco6,vuelco1", JSON.stringify(ms));
ok("cada momento cae en la jugada que cambió la partida", (() => {
  const en = (m) => juegos[m.mesa - 1].jugadas[m.ply];
  const [s2, r4] = ms;
  // Mesa 2: las blancas iban +10 y Dg2 lo tiró a 0; mesa 4: las negras
  // estaban −5 y Af2 de las blancas lo dejó parejo.
  return en(s2).san === "Qg2" && s2.lado === "b" && s2.peor === 10 && en(r4).san === "Bf2" && r4.lado === "b" && r4.peor > 5;
})(), JSON.stringify(ms.slice(0, 2)));
ok("la sorpresa: gana quien tenía 150 de Elo menos, y sin evaluación no se inventa nada más", (() => {
  const g = { id: "x", mesa: 9, resultado: "1-0", blancas: { elo: 1400 }, negras: { elo: 1600 }, jugadas: [{ san: "e4", eval: null }, { san: "e5", eval: null }] };
  const m = L.momentos([g]);
  const sin = L.momentos([Object.assign({}, g, { negras: { elo: 1500 } })]);
  return m.length === 1 && m[0].tipo === "sorpresa" && m[0].difElo === 200 && m[0].ply === 1 && !sin.length;
})());

// La categoría y la modalidad del nombre de un torneo: la misma regla en la
// página (JS) y en la función (TS). Se comparan con los mismos textos.
const TEXTOS = ["Open U15", "Girls U15", "Sub-10 Femenino", "U08", "Sub 8 Absoluto", "Blitz Sub-10 Absoluto", "Rápidas Sub-12 Femenino",
  "Rapid U14 Girls", "Lista general", "Niñas Sub-14", "Open U07", "Women U18"];
const ts = require("child_process").spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e",
  `import { codigoCategoria, modalidadDe } from ${JSON.stringify(path.join(RAIZ, "supabase/functions/sala-jugadores/torneos-sala.ts"))};
   const t = JSON.parse(process.argv[1]); process.stdout.write(JSON.stringify([t.map(codigoCategoria), t.map(modalidadDe)]));`, JSON.stringify(TEXTOS)], { encoding: "utf8" });
const deTs = ts.status === 0 ? JSON.parse(ts.stdout) : null;
ok("la función sala-jugadores se deja importar para comparar", !!deTs, ts.stderr);

// El aviso «… juega en vivo» (sala-jugadores, revisar): reconoce los enlaces
// de Lichess igual que la página, y avisa solo de la partida empezada y sin
// terminar de esa persona, en su categoría y su ronda.
const URLS = ["https://lichess.org/broadcast/centroamericano-2026/AbCd1234", "https://lichess.org/broadcast/c/ronda-1/XyZw9876",
  "https://lichess.org/broadcast/c/ronda-1/XyZw9876/Gm123456", "https://s1.chess-results.com/tnr1529719.aspx", "https://lichess.org/study/AbCd1234", "nada"];
const PARTIDAS_TS = [
  { id: "AAAAAAAA", ronda: 7, categoria: "U15F", mesa: 5, blancas: "Campos Ulate, Laura", negras: "Salazar Pineda, Elena", empezada: true, terminada: false },
  { id: "BBBBBBBB", ronda: 7, categoria: "U15F", mesa: 1, blancas: "Mora Vargas, Ana Lucia", negras: "Rojas Solano, Sofia", empezada: true, terminada: true },
  { id: "CCCCCCCC", ronda: 7, categoria: "U15F", mesa: 6, blancas: "Vindas Arce, Julia", negras: "Fallas Murillo, Andrea", empezada: false, terminada: false },
  { id: "DDDDDDDD", ronda: 7, categoria: "U15F", mesa: 7, blancas: "Brenes Soto, Ana", negras: "Leiva Mora, Rosa", empezada: true, terminada: false },
  { id: "EEEEEEEE", ronda: 7, categoria: "U15F", mesa: 8, blancas: "Brenes Soto, Ana", negras: "Quesada, Eva", empezada: true, terminada: false },
];
const CASOS_TS = [["Salazar Pineda, Elena María", "U15F", 7], ["Salazar Pineda, Elena", "U12F", 7], ["Salazar Pineda, Elena", "U15F", 6],
  ["Mora Vargas, Ana Lucia", "U15F", 7], ["Vindas Arce, Julia", "U15F", 7], ["Brenes Soto, Ana", "U15F", 7], ["salazar pineda, elena", "", 0]];
const vivoTs = require("child_process").spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e",
  `import { idDeEnlaceLichess, partidaEnVivo } from ${JSON.stringify(path.join(RAIZ, "supabase/functions/sala-jugadores/torneos-sala.ts"))};
   const [u, ps, casos] = JSON.parse(process.argv[1]);
   process.stdout.write(JSON.stringify([u.map(idDeEnlaceLichess), casos.map(([n, c, r]) => { const v = partidaEnVivo(ps, n, c, r); return v && v.p.id + v.color; })]));`,
  JSON.stringify([URLS, PARTIDAS_TS, CASOS_TS])], { encoding: "utf8" });
const deVivo = vivoTs.status === 0 ? JSON.parse(vivoTs.stdout) : null;
ok("la función reconoce los enlaces de Lichess igual que la página", !!deVivo && JSON.stringify(deVivo[0]) === JSON.stringify(URLS.map(L.idDeEnlace)), vivoTs.stderr || JSON.stringify(deVivo && deVivo[0]));
ok("y avisa solo de la partida empezada y sin terminar de esa persona, en su categoría y su ronda (con dos que calzan, de ninguna)",
   !!deVivo && JSON.stringify(deVivo[1]) === JSON.stringify(["AAAAAAAAb", null, null, null, null, null, "AAAAAAAAb"]), JSON.stringify(deVivo && deVivo[1]));

(async () => {
  console.log("2. La página");
  const nav = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  const errores = [];
  // Lo que contesta «Lichess»: el grupo con cuatro categorías; solo la de
  // Girls U15 tiene rondas (las demás, ninguna todavía).
  const ID = TORNEO.tour.id, RID = RONDA.round.id;
  async function lichess(ctx, opciones) {
    const o = opciones || {};
    const pedidos = [];
    await ctx.route("https://lichess.org/**", (route) => {
      const u = new URL(route.request().url());
      pedidos.push(u.pathname);
      if (o.falla) return route.fulfill({ status: 500, body: "" });
      const json = (d) => route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(d) });
      let m;
      if ((m = u.pathname.match(/^\/api\/broadcast\/round\/([A-Za-z0-9]{8})\.pgn$/))) {
        return route.fulfill({ status: 200, contentType: "application/x-chess-pgn", headers: { "access-control-allow-origin": "*" }, body: o.pgn ? o.pgn() : PGN });
      }
      if ((m = u.pathname.match(/^\/api\/broadcast\/-\/-\/([A-Za-z0-9]{8})$/))) return json(RONDA);
      if ((m = u.pathname.match(/^\/api\/broadcast\/([A-Za-z0-9]{8})$/))) {
        const t = TORNEO.group.tours.find((x) => x.id === m[1]);
        if (!t) return route.fulfill({ status: 404, body: "" });
        return json(Object.assign({}, TORNEO, { tour: Object.assign({}, TORNEO.tour, { id: t.id, name: t.name }), rounds: t.id === ID ? TORNEO.rounds : [] }));
      }
      return route.fulfill({ status: 404, body: "" });
    });
    return pedidos;
  }
  // Supabase de mentira: la sala (con o sin el botón de Lichess) y los
  // jugadores de chess-results, con una jugadora que también está en Lichess.
  async function supabase(ctx, conLichess) {
    await ctx.addInitScript((con) => {
      const enlaces = [{ texto: "Sub-14 Femenino", url: "https://s3.chess-results.com/tnr1529766.aspx?lan=2" }]
        .concat(con ? [{ texto: "Partidas en vivo", url: "https://lichess.org/broadcast/sudamericano-g15/OlpxXUwD" }] : []);
      const fila = (t) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: t === "salas_torneo" ? { enlaces } : null, error: null }),
        is: () => ({ gt: () => ({ order: async () => ({ data: [], error: null }) }) }) }) }) });
      window.sb = { from: fila, functions: { invoke: async () => ({ error: null, data: { modalidad: "clasico", modalidades: ["clasico"], torneos: [{ tnr: "1529766", url: "x", categoria: "U15F", ronda: 6, rondas: 9,
        jugadores: [
          { puesto: 1, no: 1, titulo: "", nombre: "Mora Vargas, Ana Lucia", fed: "COL", elo: 1433, grupo: "U15F", puntos: "4" },
          { puesto: 2, no: 2, titulo: "WCM", nombre: "Rojas Solano, Sofia", fed: "COL", elo: 1864, grupo: "U15F", puntos: "4" },
          { puesto: 3, no: 3, titulo: "", nombre: "Mora Vargas, Ana Lucia", fed: "CRC", elo: 1500, grupo: "U12F", puntos: "3" },
        ], pareo: { ronda: 7, mesas: [{ mesa: 1, blancas: { no: 1, titulo: "", nombre: "Mora Vargas, Ana Lucia" }, negras: { no: 2, titulo: "WCM", nombre: "Rojas Solano, Sofia" }, resultado: "" }] } }] } }) } };
    }, conLichess);
  }
  try {
    // Sin el botón de Lichess en la sala: la ficha queda en «Pronto» y nada se le pide a Lichess.
    const ctx0 = await nav.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
    const ped0 = await lichess(ctx0);
    await supabase(ctx0, false);
    const p0 = await ctx0.newPage();
    await p0.goto(BASE + "/" + PAGINA, { waitUntil: "load" });
    await p0.waitForTimeout(800);
    ok("sin la transmisión en la sala, la ficha sigue en «Pronto» y no se le pide nada a Lichess",
       await p0.evaluate(() => { const f = document.getElementById("ficha-partidas"); return f && f.tagName === "DIV" && f.getAttribute("aria-disabled") === "true"; }) && !ped0.length, JSON.stringify(ped0));
    ok("y «En vivo ahora» no se ve", await p0.evaluate(() => !document.getElementById("en-vivo-ahora").checkVisibility()));
    await p0.evaluate(() => document.querySelector('a[href="#fichas"]') && 0);
    await ctx0.close();

    const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
    let pgnActual = null;
    const pedidos = await lichess(ctx, { pgn: () => pgnActual || PGN });
    await supabase(ctx, true);
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errores.push(String(e)));
    await p.goto(BASE + "/" + PAGINA, { waitUntil: "load" });
    await p.waitForFunction(() => { const f = document.getElementById("ficha-partidas"); return f && f.tagName === "A"; }, null, { timeout: 8000 }).catch(() => {});
    const ficha = await p.evaluate(() => { const f = document.getElementById("ficha-partidas"); return { tag: f.tagName, href: f.getAttribute("href"), texto: f.innerText.replace(/\s+/g, " ").trim(), dis: f.getAttribute("aria-disabled") }; });
    ok("con la transmisión en la sala, la ficha se enciende y abre la ventana", ficha.tag === "A" && ficha.href === "#partidas" && /Ver las partidas/.test(ficha.texto) && !ficha.dis, JSON.stringify(ficha));
    if (deTs) {
      const deJs = await p.evaluate((t) => [t.map(window.CentroamericanoPartidas.codigoCategoria), t.map(window.CentroamericanoPartidas.modalidadDe)], TEXTOS);
      ok("la categoría y la modalidad del nombre de un torneo salen igual que en la función", JSON.stringify(deJs) === JSON.stringify(deTs), JSON.stringify([deJs, deTs]));
    }
    // «En vivo ahora», arriba de «Busca a tu jugador»: solo la que se está jugando.
    await p.waitForFunction(() => document.querySelectorAll("#en-vivo-ahora .cac-envivo-item").length > 0, null, { timeout: 8000 }).catch(() => {});
    const fila = await p.evaluate(() => { const f = document.getElementById("en-vivo-ahora");
      return { ve: f.checkVisibility(), items: [...f.querySelectorAll(".cac-envivo-item")].map((li) => li.innerText.replace(/\s+/g, " ").trim()),
        casillas: f.querySelectorAll(".cine-sq").length, ver: (f.querySelector("a") || {}).textContent, barra: (f.querySelector(".cac-vivo-barra") || { getAttribute: () => "" }).getAttribute("aria-label"),
        arriba: f.compareDocumentPosition(document.getElementById("buscador-nombre")) === Node.DOCUMENT_POSITION_FOLLOWING }; });
    ok("«En vivo ahora» sale arriba del buscador con las partidas que se están jugando (y no las terminadas)",
       fila.ve && fila.arriba && fila.items.length === 1 && /Sub-15 Femenino · Mesa 5/.test(fila.items[0]) && /Salazar Pineda, Elena/.test(fila.items[0]) && fila.casillas === 64 && fila.ver === "Ver las 1 →", JSON.stringify(fila));
    ok("con su barra, dicha para el lector", /^(igualado|mejor las blancas|mejor las negras|sin evaluación)$/.test(fila.barra), fila.barra);
    await p.click("#en-vivo-ahora .cac-partida-abrir");
    await p.waitForFunction(() => document.getElementById("partidas").open && document.querySelectorAll("#partidas-contenido .cac-visor-jugada").length > 0, null, { timeout: 8000 }).catch(() => {});
    ok("tocarla abre esa partida en el visor", await p.evaluate(() => /Mesa 5/.test((document.querySelector("#partidas-contenido [data-cabeza]") || {}).textContent || "")));
    await p.keyboard.press("Escape");
    await p.click("#ficha-partidas");
    await p.waitForFunction(() => document.querySelectorAll("#partidas-contenido .cac-partida").length > 0, null, { timeout: 8000 }).catch(() => {});
    const lista = await p.evaluate(() => ({
      abierto: document.getElementById("partidas").open,
      n: document.querySelectorAll("#partidas-contenido .cac-partida").length,
      estado: (document.querySelector("#partidas-contenido [data-estado]") || {}).textContent || "",
      cabezas: [...document.querySelectorAll("#partidas-contenido .cac-partida-cabeza")].map((e) => e.textContent),
      tableros: [...document.querySelectorAll("#partidas-contenido .cac-partida-tablero")].map((t) => t.querySelectorAll(".cine-sq").length),
      vivo: [...document.querySelectorAll("#partidas-contenido .cac-partida-resultado")].map((e) => e.textContent + "|" + e.className.includes("envivo")),
      cats: [...document.querySelectorAll('[data-filtro="categoria"] option')].map((o) => o.textContent),
    }));
    ok("la ventana muestra las 6 partidas de la ronda, cada una con su categoría, su ronda y su mesa", lista.abierto && lista.n === 6 && lista.cabezas[0] === "Sub-15 Femenino · Ronda 7 · Mesa 1" && lista.cabezas[5] === "Sub-15 Femenino · Ronda 7 · Mesa 6", JSON.stringify(lista));
    ok("cada una con su posición en un tablero chico", lista.tableros.length === 6 && lista.tableros.every((n) => n === 64), JSON.stringify(lista.tableros));
    ok("el resultado escrito, y la que se juega dice «En juego» (no solo con color)", lista.vivo.join(",") === "0-1|false,½-½|false,0-1|false,0-1|false,En juego|true,1-0|false", JSON.stringify(lista.vivo));
    ok("arriba dice la ronda, cuántas se transmiten y cuántas se juegan", /^Ronda 7 · 6 partidas transmitidas · 1 en juego\. Leído en Lichess a las/.test(lista.estado), lista.estado);
    ok("los filtros salen de lo que hay: solo la categoría que se transmite", JSON.stringify(lista.cats) === JSON.stringify(["Todas", "Sub-15 Femenino"]), JSON.stringify(lista.cats));
    ok("la página le pidió a Lichess el grupo, las rondas y la ronda (y el PGN solo de la ronda con partidas en juego, para la barra)",
       pedidos.includes("/api/broadcast/" + ID) && pedidos.includes("/api/broadcast/-/-/" + RID) && pedidos.filter((x) => /\.pgn$/.test(x)).every((x) => x === "/api/broadcast/round/" + RID + ".pgn"), JSON.stringify(pedidos));
    const cuenta = () => p.evaluate(() => document.querySelectorAll("#partidas-contenido .cac-partida").length);
    await p.selectOption('[data-filtro="pais"]', "VEN");
    ok("el filtro de país deja las partidas de ese país", await cuenta() === 1);
    await p.selectOption('[data-filtro="pais"]', "");
    await p.fill('[data-filtro="buscar"]', "rojas");
    ok("buscar un jugador, sin tildes ni mayúsculas", await cuenta() === 1);
    await p.fill('[data-filtro="buscar"]', "");
    await p.check('[data-filtro="vivo"]');
    ok("«Solo las que se están jugando»", await cuenta() === 1);
    await p.uncheck('[data-filtro="vivo"]');
    ok("«Solo mis jugadores» no sale si no sigues a nadie", await p.evaluate(() => !document.querySelector("[data-mios]").checkVisibility()));

    // Lo mejor de la ronda, arriba de la lista.
    await p.waitForFunction(() => document.querySelectorAll("#partidas-contenido .cac-momento").length > 0, null, { timeout: 8000 }).catch(() => {});
    const mom = await p.evaluate(() => { const c = document.querySelector("#partidas-contenido [data-momentos]");
      return { ve: !!c && c.checkVisibility(), titulo: c && c.querySelector("h3").textContent,
        items: [...c.querySelectorAll(".cac-momento")].map((li) => ({ texto: li.querySelector(".cac-momento-datos").innerText.replace(/\s+/g, " ").replace(/^\S+ /, "").trim(), casillas: li.querySelectorAll(".cine-sq").length })),
        antes: c.compareDocumentPosition(document.querySelector("#partidas-contenido [data-partidas]")) === Node.DOCUMENT_POSITION_FOLLOWING }; });
    ok("«Lo mejor de la ronda» sale arriba de la lista, con lo que pasó escrito y su tablero",
       mom.ve && mom.antes && /Lo mejor de la ronda/.test(mom.titulo) && mom.items.length === 5 && mom.items.every((x) => x.casillas === 64) &&
       /^Partida salvada Las negras llegaron a estar perdidas \(\+10 o más\) y se salvaron con tablas\. Todo cambió con 33\.Dg2\./.test(mom.items[0].texto) &&
       /^Remontada Las negras llegaron a estar perdidas \(\+5,1\) y terminaron ganando\. Todo cambió con 18\.Af2\./.test(mom.items[1].texto), JSON.stringify(mom));
    // Sin el nombre de quien perdió: ni la mesa ni «blancas – negras», solo el
    // apellido de quien remontó, salvó la partida o dio la sorpresa.
    const pie = await p.evaluate(() => [...document.querySelectorAll("#partidas-contenido .cac-momento")].map((li) => ({
      tipo: li.querySelector("[data-momento]").dataset.momento, pie: li.querySelector(".cac-momento-partida").textContent,
      aria: li.querySelector("[data-momento]").getAttribute("aria-label") })));
    ok("«Lo mejor de la ronda» no dice la mesa ni el nombre del rival: solo el apellido de quien lo logró",
       pie.length === 5 && pie.every((x) => !/Mesa| – |,/.test(x.pie) && !/ contra /.test(x.aria)) &&
       pie.filter((x) => x.tipo !== "vuelco").every((x) => /· lo logró \S/.test(x.pie)) && pie.filter((x) => x.tipo === "vuelco").every((x) => !/lo logró/.test(x.pie)), JSON.stringify(pie));
    await p.selectOption('[data-filtro="pais"]', "VEN");
    await p.waitForTimeout(300);
    ok("y pasa por los mismos filtros", await p.evaluate(() => !document.querySelector("#partidas-contenido [data-momentos]").checkVisibility()));
    await p.selectOption('[data-filtro="pais"]', "");
    await p.waitForFunction(() => document.querySelectorAll("#partidas-contenido .cac-momento").length === 5, null, { timeout: 8000 }).catch(() => {});
    await p.click('#partidas-contenido [data-momento="remontada"]');
    await p.waitForFunction(() => document.querySelectorAll("#partidas-contenido [data-jugadas] .cac-visor-jugada").length > 0, null, { timeout: 8000 }).catch(() => {});
    const enMom = await p.evaluate(() => { const c = document.getElementById("partidas-contenido"); const a = c.querySelector('.cac-visor-jugada[aria-current="true"]');
      return { ply: a ? Number(a.dataset.ply) : -1, jug: a ? a.textContent : "", momento: c.querySelector("[data-momento]").checkVisibility() ? c.querySelector("[data-momento]").textContent : "",
        nuevas: c.querySelector("[data-nuevas]").checkVisibility(), cabeza: c.querySelector("[data-cabeza]").textContent }; });
    ok("«Ver el momento» abre la partida en esa jugada, lo dice arriba y no avisa de jugadas «nuevas»",
       enMom.ply === 34 && enMom.jug === "Af2" && /^Remontada: Las negras/.test(enMom.momento) && !enMom.nuevas && /Mesa 4/.test(enMom.cabeza), JSON.stringify(enMom));
    await p.click("[data-volver]");
    await p.waitForFunction(() => document.activeElement && document.activeElement.dataset.momento === "remontada", null, { timeout: 5000 }).catch(() => {});
    ok("al volver, el foco queda en el momento que se miraba", await p.evaluate(() => document.activeElement && document.activeElement.dataset.momento === "remontada"));

    // El visor.
    await p.click('#partidas-contenido [data-partida="' + juegos[0].id + '"]');
    await p.waitForFunction(() => document.querySelectorAll("#partidas-contenido [data-jugadas] .cac-visor-jugada").length > 0, null, { timeout: 8000 }).catch(() => {});
    const estado = () => p.evaluate(() => {
      const c = document.getElementById("partidas-contenido");
      const actual = c.querySelector('.cac-visor-jugada[aria-current="true"]');
      return {
        cabeza: (c.querySelector("[data-cabeza]") || {}).textContent,
        eval: (c.querySelector("[data-eval]") || {}).textContent,
        barra: parseFloat((c.querySelector(".cac-visor-barra-blancas") || { style: {} }).style.height),
        actual: actual ? actual.textContent : null, ply: actual ? Number(actual.dataset.ply) : -1,
        jugadas: c.querySelectorAll(".cac-visor-jugada").length,
        primera: c.querySelector('[data-nav="primera"]').disabled, ultima: c.querySelector('[data-nav="ultima"]').disabled,
        casilla: c.querySelector("[data-tablero] .cine-sq").dataset.square,
        aria: c.querySelector("[data-tablero]").getAttribute("aria-label"),
        anuncio: c.querySelector("[data-anuncio]").textContent,
        arriba: c.querySelector("[data-arriba]").textContent, abajo: c.querySelector("[data-abajo]").textContent,
        nuevas: c.querySelector("[data-nuevas]").checkVisibility() ? c.querySelector("[data-nuevas]").textContent : "",
        grafico: !!c.querySelector("[data-grafico] svg") && c.querySelector("[data-grafico]").checkVisibility(),
        afuera: [...document.getElementById("partidas").querySelectorAll("a[href]")].map((a) => a.href).filter((h) => new URL(h, location.href).origin !== location.origin),
        foco: document.activeElement && (document.activeElement.dataset.volver != null ? "volver" : document.activeElement.textContent),
      };
    });
    let e = await estado();
    ok("al abrir una partida se ve la última jugada, con su categoría, su ronda y su mesa", e.cabeza === "Sub-15 Femenino · Ronda 7 · Mesa 1 · Terminó: 0-1." && e.ply === juegos[0].jugadas.length - 1 && e.jugadas === juegos[0].jugadas.length, JSON.stringify(e));
    ok("el foco va a «Todas las partidas», para volver", e.foco === "volver", e.foco);
    ok("las jugadoras con su federación, Elo y reloj, las negras arriba", /Rojas Solano, Sofia\s*COL\s*1864/.test(e.arriba) && /Mora Vargas, Ana Lucia\s*COL\s*1433/.test(e.abajo) && /\d+:\d\d/.test(e.abajo), JSON.stringify([e.arriba, e.abajo]));
    ok("en la última no se puede seguir: «siguiente» y «última» apagadas", e.ultima && !e.primera);
    ok("la evaluación escrita y la barra del lado que gana (mate de las negras: vacía)", /Evaluación de Lichess: mate en \d+ para las negras/.test(e.eval) && e.barra === 0, JSON.stringify([e.eval, e.barra]));
    ok("el gráfico de la evaluación de toda la partida", e.grafico);
    ok("ningún enlace saca de la página (ni «Ver en Lichess»): quien mira se queda", !e.afuera.length, JSON.stringify(e.afuera));
    await p.keyboard.press("Home");
    e = await estado();
    ok("Inicio: la posición inicial, con la barra en el medio", e.ply === -1 && e.primera && /Posición inicial/.test(e.eval) && e.barra === 50 && e.casilla === "a8", JSON.stringify(e));
    await p.keyboard.press("ArrowRight");
    e = await estado();
    ok("→: la primera jugada, marcada en la lista, dicha para el lector y con su evaluación", e.actual === "d4" && e.ply === 0 && /Jugada 1, blancas: d4\./.test(e.anuncio) && /\+0,2 \(igualado\)/.test(e.eval) && e.barra > 50, JSON.stringify(e));
    await p.click('[data-nav="siguiente"]'); await p.click('[data-nav="siguiente"]');
    e = await estado();
    ok("los botones también avanzan", e.actual === "c4" && e.ply === 2, JSON.stringify(e));
    await p.keyboard.press("ArrowLeft");
    ok("← vuelve una, y las jugadas van en algebraica española («Cf6», no «Nf6»)", (await estado()).actual === "Cf6");
    await p.click('.cac-visor-jugada[data-ply="10"]');
    ok("tocar una jugada de la lista va a esa posición", (await estado()).ply === 10);
    ok("el tablero se describe en palabras para quien no lo ve", /^Blancas: rey en e1, .*alfil en g2/.test((await estado()).aria), (await estado()).aria);
    await p.click(".cac-visor-girar");
    e = await estado();
    ok("«Girar el tablero»: las negras abajo (y el botón dice que está puesto)", e.casilla === "h1" && /Mora Vargas/.test(e.arriba) && await p.evaluate(() => document.querySelector(".cac-visor-girar").getAttribute("aria-pressed") === "true"), JSON.stringify(e));
    await p.click(".cac-visor-girar");

    // En vivo: la partida 5 se está jugando. Primero llega con menos jugadas;
    // estando en la última, las nuevas la llevan sola; estando atrás, no se mueve.
    const g5 = juegos[4];
    const corta = (n) => PGN.split(/\n\s*\n(?=\[)/).map((b) => {
      if (!b.includes(g5.id)) return b;
      const [cab, ...resto] = b.split(/\n\n/);
      const tokens = resto.join("\n\n").split(/\s+(?=\d+\.\s)/);
      return cab + "\n\n" + tokens.slice(0, n).join(" ") + " *";
    }).join("\n\n");
    pgnActual = corta(20);
    await p.click("[data-volver]");
    await p.waitForSelector('#partidas-contenido [data-partida="' + g5.id + '"]');
    ok("al volver a la lista, el foco queda en la partida que se miraba", await p.evaluate((id) => document.activeElement && document.activeElement.dataset.partida === id, juegos[0].id));
    await p.click('#partidas-contenido [data-partida="' + g5.id + '"]');
    await p.waitForFunction(() => document.querySelectorAll("#partidas-contenido .cac-visor-jugada").length > 0);
    e = await estado();
    ok("una partida en juego dice «En juego»", /· En juego$/.test(e.cabeza) && e.jugadas === 40, JSON.stringify(e));
    pgnActual = corta(25);
    await p.evaluate(() => window.CentroamericanoPartidas.actualizar());
    e = await estado();
    ok("estando en la última, las jugadas nuevas la llevan a la de ahora", e.jugadas === 50 && e.ply === 49 && !e.nuevas, JSON.stringify(e));
    await p.keyboard.press("ArrowLeft"); await p.keyboard.press("ArrowLeft");
    pgnActual = corta(30);
    await p.evaluate(() => window.CentroamericanoPartidas.actualizar());
    e = await estado();
    ok("estando atrás, las nuevas no le mueven la posición: avisa cuántas hay", e.jugadas === 60 && e.ply === 47 && /Ir a la jugada de ahora \(12 nuevas\)/.test(e.nuevas), JSON.stringify(e));
    await p.click("[data-nuevas]");
    e = await estado();
    ok("y con un toque va a la de ahora", e.ply === 59 && !e.nuevas, JSON.stringify(e));
    pgnActual = null;
    // Sin evaluación de Lichess en una jugada: lo dice y ofrece Stockfish.
    await p.click("[data-volver]");
    await p.waitForSelector('#partidas-contenido [data-partida="' + juegos[2].id + '"]');
    await p.click('#partidas-contenido [data-partida="' + juegos[2].id + '"]');
    await p.waitForFunction(() => document.querySelectorAll("#partidas-contenido .cac-visor-jugada").length > 0);
    e = await estado();
    ok("sin la evaluación de Lichess lo dice y ofrece calcularla en el aparato (no la inventa)",
       /Lichess no trae la evaluación de esta jugada/.test(e.eval) && /Calcular con Stockfish/.test(e.eval) && await p.evaluate(() => document.querySelector(".cac-visor-barra").classList.contains("cac-visor-barra-sin")), JSON.stringify(e));
    await p.setViewportSize({ width: 360, height: 760 });
    await p.waitForTimeout(300);
    ok("en el celular cabe sin scroll de costado", await p.evaluate(() => { const d = document.getElementById("partidas"); return d.scrollWidth <= d.clientWidth + 1 && document.documentElement.scrollWidth <= window.innerWidth; }));
    await p.keyboard.press("Escape");
    await p.setViewportSize({ width: 1280, height: 900 });

    // El proyector pasa también las partidas en vivo, con su barra escrita.
    await p.click('a[href="#proyector"]');
    await p.waitForFunction(() => document.getElementById("proyector").open && document.querySelector("#proyector-contenido .cac-proyector-partida"), null, { timeout: 10000 }).catch(() => {});
    const proy = await p.evaluate(() => ({ titulo: document.getElementById("proyector-titulo").textContent,
      partidas: [...document.querySelectorAll("#proyector-contenido .cac-proyector-partida")].map((c) => ({ texto: c.innerText.replace(/\s+/g, " ").trim(), casillas: c.querySelectorAll(".cine-sq").length })),
      modos: [...document.querySelectorAll("#proyector-modo option")].map((o) => o.value) }));
    ok("el proyector empieza por las partidas en vivo, cada una con su tablero y su barra escrita",
       /^Partidas en vivo/.test(proy.titulo) && proy.partidas.length === 1 && proy.partidas[0].casillas === 64 && /Salazar Pineda/.test(proy.partidas[0].texto) && /(igualado|mejor las|sin evaluación)/.test(proy.partidas[0].texto), JSON.stringify(proy));
    ok("y se puede dejar en «Solo las partidas en vivo»", proy.modos.includes("vivo"), JSON.stringify(proy.modos));
    await p.keyboard.press("Escape");
    await p.evaluate(() => history.replaceState(null, "", location.pathname));

    // El enlace del aviso al celular, #partida=<id>, abre esa partida en el visor.
    await p.evaluate((id) => { location.hash = "partida=" + id; }, g5.id);
    await p.waitForFunction(() => document.getElementById("partidas").open && document.querySelectorAll("#partidas-contenido .cac-visor-jugada").length > 0, null, { timeout: 8000 }).catch(() => {});
    const porEnlace = await p.evaluate(() => ({ cabeza: (document.querySelector("#partidas-contenido [data-cabeza]") || {}).textContent || "", hash: location.hash }));
    ok("el enlace del aviso «… juega en vivo» abre esa partida en el visor (y se borra de la dirección)", /Mesa 5 · En juego$/.test(porEnlace.cabeza) && !porEnlace.hash, JSON.stringify(porEnlace));
    await p.keyboard.press("Escape");

    // El botón en la tarjeta del jugador: solo para quien está en un tablero
    // transmitido, de su categoría (la de Sub-12 con el mismo nombre, no).
    await p.fill("#buscador-nombre", "mora vargas");
    await p.waitForFunction(() => document.querySelector('#buscador-resultados [data-accion="partida-en-vivo"]'), null, { timeout: 8000 }).catch(() => {});
    const tarjetas = await p.evaluate(() => [...document.querySelectorAll("#buscador-resultados li.cac-jugador")].map((li) => ({
      cat: li.textContent.includes("Sub-15") ? "U15F" : li.textContent.includes("Sub-12") ? "U12F" : "?",
      boton: (li.querySelector('[data-accion="partida-en-vivo"]') || {}).textContent || "" })));
    ok("la tarjeta de quien está en un tablero transmitido trae «Ver su partida»", tarjetas.some((t) => t.cat === "U15F" && /Ver su partida/.test(t.boton)), JSON.stringify(tarjetas));
    ok("y la de alguien con el mismo nombre en otra categoría, no", tarjetas.some((t) => t.cat === "U12F" && !t.boton), JSON.stringify(tarjetas));
    await p.click('#buscador-resultados [data-accion="partida-en-vivo"]');
    await p.waitForFunction(() => document.getElementById("partidas").open && document.querySelectorAll("#partidas-contenido .cac-visor-jugada").length > 0, null, { timeout: 8000 }).catch(() => {});
    e = await estado();
    ok("y abre su partida en el visor", /Mesa 1/.test(e.cabeza) && /Mora Vargas/.test(e.abajo), JSON.stringify(e));
    await p.keyboard.press("Escape");
    ok("sin errores de JavaScript", !errores.length, JSON.stringify(errores));
    await ctx.close();

    // Lichess no contesta: lo dice, sin inventar partidas.
    const ctx2 = await nav.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
    await lichess(ctx2, { falla: true });
    await supabase(ctx2, true);
    const p2 = await ctx2.newPage();
    await p2.goto(BASE + "/" + PAGINA + "#partidas", { waitUntil: "load" });
    await p2.waitForFunction(() => /Lichess/.test(document.getElementById("partidas-contenido").textContent) && !/Buscando/.test(document.getElementById("partidas-contenido").textContent), null, { timeout: 8000 }).catch(() => {});
    ok("si Lichess no contesta, lo dice", /No pudimos leer Lichess ahora mismo/.test(await p2.textContent("#partidas-contenido")), await p2.textContent("#partidas-contenido"));
    await ctx2.close();
  } finally {
    await nav.close();
  }
  console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nTodo bien");
  process.exit(fallos ? 1 : 0);
})();
