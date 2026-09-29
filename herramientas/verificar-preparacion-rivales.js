/* La preparación de rivales (preparacion-rivales.html y js/preparacion-analisis.js).
 *
 * Lo que se rompe acá no da error: un PGN con comentarios o variantes que se
 * cuelan como jugadas arma un árbol con líneas que nadie jugó; un rival
 * escrito «Apellido, Nombre» en unas partidas y «Nombre Apellido» en otras
 * queda partido en dos; una recomendación sale de 3 partidas; la revisión del
 * motor no marca el error que el rival repite. La página se ve perfecta en
 * todos esos casos. Por eso, dos partes:
 *
 *   1. EL ANÁLISIS, en Node y sin navegador: un PGN armado con patrones
 *      conocidos (dónde pierde, dónde gana, dónde improvisa) y la
 *      comprobación de que el análisis los encuentra.
 *   2. LA PÁGINA, en un navegador con un Supabase de mentira y un Stockfish
 *      de mentira: sin la función activa no se ve nada; con ella se carga un
 *      archivo, se elige al rival, se pinta el análisis, el motor marca el
 *      error plantado y se guarda solo el resultado.
 *
 * Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
 *       node herramientas/verificar-preparacion-rivales.js
 */
const { chromium } = require("./lib/playwright-con-sesion");
const { contestarAvisos } = require("./lib/avisos-prueba.js");
const A = require("../js/preparacion-analisis.js");
const R = require("../js/preparacion-resumen.js");
const C = require("../js/preparacion-cruce.js");
const L = require("../js/preparacion-lineas.js");
const Pos = require("../js/preparacion-posiciones.js");
const { Chess } = require("chess.js");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}
function cierto(nombre, v) { if (v) console.log("  ✓ " + nombre); else { console.log("  ✗ " + nombre); fallos += 1; } }

// ------------------------------------------------------------ el PGN de prueba

function partida(blancas, negras, resultado, jugadas, extra) {
  return `[Event "Rated Blitz game"]
[Date "2025.03.04"]
[White "${blancas}"]
[Black "${negras}"]
[Result "${resultado}"]
[WhiteElo "2000"]
[BlackElo "2010"]
[TimeControl "180+2"]
${extra || ""}
1. ${jugadas} ${resultado}

`;
}

/* El rival es Pedro Pérez, escrito de TRES maneras. Los patrones:
   - con negras contra 1.e4 juega 1…e5 y pierde 15 de 20 (su punto débil);
   - con negras contra 1.d4 juega 1…d5 y gana 16 de 20 (su fuerte);
   - con blancas juega 1.d4 c5 2.Cc3 cxd4 3.Dxd4 Cc6 4.Dh4 (el «error» que el
     Stockfish de mentira castiga) y ahí gana 10 de 12;
   - con blancas, después de 1.e4 e6 2.d4 d5 reparte entre cuatro jugadas.
   Y un comentario, una variante anidada y un NAG que no pueden colarse. */
function pgnDePrueba() {
  let t = "";
  for (let i = 0; i < 20; i++) t += partida("Rival " + i, i % 2 ? "Pérez, Pedro" : "Pedro Perez", i < 15 ? "1-0" : "0-1",
    "e4 e5 2. Nf3 {su jugada de siempre} Nc6 3. Bb5 (3. Bc4 Bc5 (3... Nf6)) a6 $1 4. Ba4 Nf6 5. O-O Be7");
  for (let i = 0; i < 20; i++) t += partida("Rival " + i, "Pedro Pérez", i < 16 ? "0-1" : "1/2-1/2", "d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7");
  for (let i = 0; i < 12; i++) t += partida("PEDRO PÉREZ", "Otro " + i, i < 10 ? "1-0" : "0-1", "d4 c5 2. Nc3 cxd4 3. Qxd4 Nc6 4. Qh4 e6");
  const reparto = ["Nc3", "e5", "exd5", "Nd2"];
  for (let i = 0; i < 20; i++) t += partida("Pedro Perez", "Otro " + i, i < 12 ? "1-0" : "0-1", "e4 e6 2. d4 d5 3. " + reparto[i % 4] + " Nf6");
  // Un nombre con marcado: tiene que salir como texto en toda la página.
  t += partida("<img src=x onerror=alert(1)>", "Pedro Perez", "1-0", "e4 e5 2. Nf3 Nc6");
  return t;
}

// ------------------------------------------------------------ 1. el análisis

function pruebaAnalisis() {
  console.log("\n=== El análisis, sin navegador ===");
  igual("las jugadas no traen comentarios, variantes ni NAG",
    A.jugadasDe("1. e4 {bien} e5 2. Nf3 (2. Bc4 Bc5 (2... Nf6)) Nc6 $1 3. Bb5+! a6?! 4. O-O-O# 1-0"),
    ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "O-O-O"]);
  igual("«0-0» se lee como enroque y la coronación con su «=»", A.jugadasDe("1. 0-0 0-0-0 2. e8Q"), ["O-O", "O-O-O", "e8=Q"]);

  const partidas = A.leerPgn(pgnDePrueba());
  igual("se leen todas las partidas", partidas.length, 73);
  const lista = A.jugadores(partidas);
  igual("«Pérez, Pedro», «Pedro Perez» y «PEDRO PÉREZ» son la misma persona, y va primera",
    [lista[0].clave, lista[0].partidas], ["pedro perez", 73]);

  const r = A.analizar(partidas, lista[0].nombre);
  igual("cuenta sus partidas y sus resultados", [r.total, r.global.g, r.global.t, r.global.p], [73, 43, 4, 26]);
  igual("una línea cuenta desde 4 partidas con un archivo chico", r.minimo, 4);
  igual("el ritmo sale del TimeControl (180+2 es blitz)", r.porRitmo.map((x) => x.ritmo), ["blitz"]);

  const debiles = r.debiles.map((l) => l.color + " " + A.lineaEs(l.sec));
  cierto("encuentra su punto débil con negras: 1.e4 e5 (" + debiles.join(" | ") + ")", debiles.includes("b 1.e4 e5"));
  const fuertes = r.fuertes.map((l) => l.color + " " + A.lineaEs(l.sec));
  cierto("y su fuerte: 1.d4 d5 (" + fuertes.join(" | ") + ")", fuertes.includes("b 1.d4 d5"));
  igual("con blancas le recomienda 1.e4, donde él saca menos", A.sanEs(r.conBlancas.plan[0].san), "e4");
  igual("y la primera de la tabla es la mejor para ti", r.conBlancas.primeras.map((x) => x.san), ["e4", "d4"]);
  igual("el plan sigue su línea: después de 1.e4 él juega 1…e5 siempre",
    [r.conBlancas.plan[0].hijos[0].san, r.conBlancas.plan[0].hijos[0].quien, Math.round(100 * r.conBlancas.plan[0].hijos[0].reparto)], ["e5", "rival", 100]);
  cierto("dice dónde improvisa: después de 1.e4 e6 2.d4 d5", r.improvisa.some((x) => x.color === "w" && A.lineaEs(x.sec) === "1.e4 e6 2.d4 d5"));
  cierto("el FODA trae algo en los cuatro cuadros",
    ["fortalezas", "debilidades", "oportunidades", "amenazas"].every((k) => r.foda[k].length > 0));
  cierto("y habla en notación española (Cf3, no Nf3)", !JSON.stringify(r.foda).match(/\bN[a-h][1-8]\b/) && /Cf3|Dh4|Ab5/.test(JSON.stringify(r.foda) + A.lineaEs(r.principal.b.sec)));

  // El motor: las tareas son posiciones legales, y un error plantado se marca.
  const tareas = A.tareasDelMotor(r);
  cierto("las tareas del motor son posiciones legales", tareas.length > 0 && tareas.every((t) => A.fenDe(t.sec) && A.fenDe(t.sec.concat(t.jugada))));
  const dh4 = tareas.find((t) => t.clave === "d4 c5 Nc3 cxd4 Qxd4 Nc6 Qh4");
  cierto("entre ellas, su 4.Dh4 de siempre", !!dh4 && dh4.quien === "rival");
  const evals = {};
  tareas.forEach((t) => { evals[t.clave] = { antes: 0.2, mejor: t.jugada, despues: 0.2 }; });
  evals[dh4.clave] = { antes: 0.1, mejor: "Qd1", despues: -0.8 };
  A.aplicarMotor(r, tareas, evals, "prueba");
  igual("el motor marca 4.Dh4 como su error", r.motor.errores.map((x) => A.lineaEs(x.sec.concat(x.jugada))), ["1.d4 c5 2.Cc3 cxd4 3.Dxd4 Cc6 4.Dh4"]);
  cierto("y el FODA lo dice en Oportunidades", r.foda.oportunidades.some((t) => /suele jugar Dh4/.test(t) && /Dd1/.test(t)));
  igual("las evaluaciones se escriben como en español", [A.textoEval(-0.8), A.textoEval(1.25), A.textoEval(97)], ["−0,80", "+1,25", "+M3"]);
  cierto("el resultado se puede guardar como JSON (y pesa poco)", JSON.stringify(r).length < 200000);
  return r;
}


// ------------------------------------------------------------ etapa 1: la base

/* Las posiciones: js/preparacion-posiciones.js tiene que dar la MISMA clave que
   chess.js en cada jugada (si no, el árbol por posición junta lo que no es y el
   libro de Oscar no encuentra nada). Partidas al azar con semilla fija, y dos
   partidas de verdad con lo que el azar casi nunca trae: una captura al paso y
   una pieza clavada que por eso no se desambigua. */
function pruebaPosiciones() {
  console.log("\n=== Las posiciones, contra chess.js ===");
  let semilla = 2026;
  const azar = () => { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; return semilla / 0x7fffffff; };
  const comparar = (sec) => {
    const g = new Chess();
    let e = Pos.inicial();
    for (const san of sec) {
      g.move(san);
      e = e && Pos.aplicar(e, san);
      if (!e || Pos.clave(e) !== g.fen().split(" ").slice(0, 4).join(" ")) return san;
    }
    return null;
  };
  let jugadas = 0, fallidas = [];
  for (let j = 0; j < 40; j++) {
    const g = new Chess();
    const sec = [];
    for (let k = 0; k < 80 && !g.game_over(); k++) { const ms = g.moves(); const san = ms[Math.floor(azar() * ms.length)]; g.move(san); sec.push(san); }
    jugadas += sec.length;
    const f = comparar(sec);
    if (f) fallidas.push(f);
  }
  igual("40 partidas al azar (" + jugadas + " jugadas): la misma clave que chess.js en todas", fallidas, []);
  igual("una captura al paso (…axb3)", comparar("f4 a5 e3 a4 h4 d5 h5 h6 Ne2 Qd6 e4 Qe6 Nec3 Qc6 Nxd5 Be6 g3 Qd7 b4 axb3".split(" ")), null);
  igual("un caballo clavado: «Nxf3» sin desambiguar porque el de d2 no se puede mover",
    comparar("b3 a6 d4 d6 e3 Nc6 a3 h5 Qxh5 a5 g3 Bd7 h3 Qb8 Qf5 Rxh3 Bd3 Bc8 Qh7 Rxh1 Qh2 Nf6 Kf1 Bd7 f4 Qa7 Ke2 Nd8 Kd2 Rxh2+ Be2 Ne6 c3 Kd8 Bb2 Bc8 c4 Nh5 Kc2 Nhxf4 Nd2 Ng5 Bf3 Qc5 Rd1 Rg2 Rf1 Nxf3 Nxf3".split(" ")), null);
  igual("enroques, y el derecho que se pierde al comerse una torre",
    comparar("e4 e5 Nf3 Nc6 Bc4 Bc5 O-O Nf6 d3 O-O b3 d6 Bb2 Bg4 Bxe5 dxe5 Nc3 Qd6 Na4 Bxf2+ Rxf2".split(" ")), null);
  const t0 = Date.now();
  let e = Pos.inicial();
  for (let i = 0; i < 20000; i++) { e = Pos.inicial(); for (const san of "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O".split(" ")) e = Pos.aplicar(e, san); Pos.clave(e); }
  cierto("y rápido: 320.000 jugadas en " + (Date.now() - t0) + " ms (chess.js tardaría más de un minuto)", Date.now() - t0 < 3000);
}

// Cómo terminó cada partida, y los relojes que traen los PGN de Lichess y Chess.com.
function pruebaDatosPorPartida() {
  console.log("\n=== Lo que se guarda de cada partida ===");
  const x = A.jugadasYRelojes("1. e4 { [%clk 0:03:00] } 1... e5 { [%clk 0:02:58] } 2. Qh5 {[%clk 0:02:55]} Nc6 3. Bc4 (3. Qxe5+ Nxe5) Nf6 4. Qxf7# { [%clk 0:02:50] } 1-0");
  igual("las jugadas, sin la variante", x.jugadas, ["e4", "e5", "Qh5", "Nc6", "Bc4", "Nf6", "Qxf7"]);
  igual("y el reloj de cada una, en segundos (sin reloj, vacío)", x.relojes, [180, 178, 175, null, null, null, 170]);
  igual("sin relojes en el PGN, no se inventan", A.jugadasYRelojes("1. e4 e5 2. Nf3 *").relojes, null);
  const casos = [
    [{ Termination: "Time forfeit" }, "G", false, "tiempo"],
    [{ Termination: "Normal" }, "G", true, "mate"],
    [{ Termination: "Normal" }, "P", false, "abandono"],
    [{ Termination: "Normal" }, "T", false, "tablas"],
    [{ Termination: "Pedro won by resignation" }, "P", false, "abandono"],
    [{ Termination: "Pedro won by checkmate" }, "G", false, "mate"],
    [{ Termination: "Pedro won on time" }, "G", false, "tiempo"],
    [{ Termination: "Game drawn by repetition" }, "T", false, "repeticion"],
    [{ Termination: "Game drawn by stalemate" }, "T", false, "ahogado"],
    [{ Termination: "Game drawn by timeout vs insufficient material" }, "T", false, "tablas"],
    [{ Termination: "Abandoned" }, "P", false, "abandonada"],
    [{}, "G", false, "otro"],
  ];
  igual("cómo terminó, en pocas categorías (Lichess y Chess.com)", casos.map(([e, r, m]) => A.finDe(e, r, m)), casos.map((c) => c[3]));
  const [p] = A.leerPgn('[White "Pedro"]\n[Black "Otro"]\n[Result "1-0"]\n[Termination "Normal"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0');
  igual("un mate se reconoce por la jugada aunque la etiqueta diga «Normal»", A.partidasDelRival([p], "pedro")[0].fin, "mate");
}

/* Las transposiciones: la misma posición por dos órdenes cuenta junta. El
   rival (negras) llega a 1.d4 Cf6 2.c4 e6 en 10 partidas y a 1.c4 e6 2.d4 Cf6
   en otras 10: el plan tiene que ver 20 partidas en esa posición. */
function pruebaTransposiciones() {
  console.log("\n=== Transposiciones: una posición, sin importar el orden ===");
  let t = "";
  for (let i = 0; i < 10; i++) t += partida("Otro " + i, "Pedro", i < 8 ? "1-0" : "0-1", "d4 Nf6 2. c4 e6 3. Nc3 Bb4");
  for (let i = 0; i < 10; i++) t += partida("Otro " + i, "Pedro", i < 8 ? "1-0" : "0-1", "c4 e6 2. d4 Nf6 3. Nc3 Bb4");
  const r = A.analizar(A.leerPgn(t), "Pedro");
  const nodo = (function buscar(ns, prof) {
    for (const x of ns) { if (prof === 3) return x; const h = buscar(x.hijos || [], prof + 1); if (h) return h; }
    return null;
  })(r.conBlancas.plan, 0);
  igual("después de cuatro medias jugadas, el plan cuenta las 20 partidas de los dos órdenes", nodo && [nodo.n, L.pct(nodo.puntos)], [20, "20,0 %"]);
  cierto("y sigue más allá con las 20 (3.Cc3 Ab4)", nodo && nodo.hijos && nodo.hijos[0] && nodo.hijos[0].n === 20);
}

// Los filtros: por ritmo y desde una fecha, con lo que había disponible.
function pruebaFiltros() {
  console.log("\n=== Filtros por ritmo y fecha ===");
  const conRitmo = (tc, fecha, res) => partida("Pedro", "Otro", res, "e4 e5 2. Nf3 Nc6", "").replace('[TimeControl "180+2"]', '[TimeControl "' + tc + '"]').replace('[Date "2025.03.04"]', '[Date "' + fecha + '"]');
  let t = "";
  for (let i = 0; i < 12; i++) t += conRitmo("60+0", "2026.06.0" + (1 + (i % 8)), "1-0");
  for (let i = 0; i < 8; i++) t += conRitmo("600+5", "2023.02.0" + (1 + (i % 8)), "0-1");
  const ps = A.leerPgn(t);
  const todo = A.analizar(ps, "Pedro");
  igual("sin filtros, todas; y dice qué hay para filtrar", [todo.total, todo.disponibles.ritmos, todo.disponibles.anios],
    [20, [{ ritmo: "bullet", n: 12 }, { ritmo: "rápida", n: 8 }], [{ anio: "2023", n: 8 }, { anio: "2026", n: 12 }]]);
  const rapidas = A.analizar(ps, "Pedro", { ritmos: ["rápida"] });
  igual("solo rápidas: 8 partidas, y avisa que son pocas", [rapidas.total, rapidas.totalRival, rapidas.pocas, L.pct(rapidas.global.puntos)], [8, 20, true, "0,0 %"]);
  const recientes = A.analizar(ps, "Pedro", { desde: "2025-09-28" });
  igual("desde una fecha: las del último año", [recientes.total, recientes.filtros.desde], [12, "2025-09-28"]);
  const nada = A.analizar(ps, "Pedro", { ritmos: ["clásica"] });
  igual("si ninguna pasa, lo dice (y conserva lo disponible para volver a filtrar)", [nada.vacio, nada.totalRival, nada.disponibles.ritmos.length], [true, 20, 2]);
}

// El plan en PGN: con encabezado, comentarios, variantes y jugadas legales.
function pruebaPgnDelPlan(r) {
  console.log("\n=== El plan en PGN ===");
  const pgn = L.planAPgn(r, "conNegras");
  cierto("lleva encabezado: quién es quién", /\[White "Pedro Perez"\]/.test(pgn) && /\[Black "Tú"\]/.test(pgn) && /\[Event "Preparación contra Pedro Perez"\]/.test(pgn));
  cierto("comenta cuánto saca él en cada jugada", /\{Él la juega el \d+ % de las veces; él saca [\d,]+ % en \d+ partidas\}/.test(pgn));
  cierto("las ramas van como variantes", /\(1\. d4 /.test(pgn));
  cierto("y el error de Stockfish, en la jugada que toca", /4\. Qh4 \{[^}]*Stockfish: es un error \(\+0,10 → −0,80\), lo mejor era Dd1/.test(pgn));
  // Cada camino del plan tiene que ser una partida legal.
  const malos = [];
  (function recorrer(ns, sec) { for (const x of ns) { const s = sec.concat(x.san); if (!L.fenDe(s)) malos.push(s.join(" ")); recorrer(x.hijos || [], s); } })(r.conNegras.plan, []);
  igual("todas las líneas del plan son legales", malos, []);
  igual("y la línea principal se vuelve a leer igual", A.leerPgn(pgn)[0].jugadas.slice(0, 4), ["e4", "e6", "d4", "d5"]);
}

/* Un análisis como los que se guardaron antes de la etapa 1 (versión 1): sin
   filtros, sin lo disponible, sin totalRival. Se arma quitándole eso a uno de
   ahora, que es exactamente lo que no tenían. */
function analisisVersion1() {
  const r = A.analizar(A.leerPgn(pgnDePrueba()), "Pedro Perez");
  for (const k of ["filtros", "disponibles", "totalRival", "pocas"]) delete r[k];
  r.version = 1;
  r.rival = "Viejo Rival";
  return JSON.parse(JSON.stringify(r));
}


// ------------------------------------------------------------ etapa 2: más allá de la apertura

// Los tipos de final, con posiciones armadas a mano.
function pruebaTiposDeFinal() {
  console.log("\n=== Etapa 2: los tipos de final ===");
  const tipo = (fen) => { const pz = Pos.piezas(Pos.desdeFen(fen)); return A.esFinal(pz) ? A.tipoDeFinal(pz) : "no es final"; };
  const casos = [
    ["8/5k2/8/8/8/8/2K5/8 w - -", "de peones"],
    ["r7/5k2/8/8/8/8/2K5/R7 w - -", "de torres"],
    ["8/5k2/8/2b5/8/8/2K1B3/8 w - -", "de alfiles de distinto color"],
    ["8/5k2/8/3b4/8/8/2K1B3/8 w - -", "de alfiles del mismo color"],
    ["8/5k2/8/2n5/8/8/2K1B3/8 w - -", "de alfil contra caballo"],
    ["r7/5k2/8/2n5/8/8/2K1B3/R7 w - -", "de torre y pieza menor"],
    ["q7/5k2/8/8/8/8/2K5/Q7 w - -", "de damas"],
    ["q7/5k2/8/8/8/8/2K5/QR6 w - -", "no es final"],
    ["rr6/5k2/8/2n5/8/8/2K1B3/RR6 w - -", "no es final"],
  ];
  igual("cada posición, su tipo (y dama y torre contra dama no es final)", casos.map(([f]) => tipo(f)), casos.map((c) => c[1]));
}

/* Dónde entra la partida en un final: se compara contra un cálculo aparte,
   hecho con el tablero de chess.js, en partidas al azar. Mismo criterio (13
   puntos de piezas y dos piezas por lado), otra forma de contarlas. */
function pruebaDeteccionDeFinales() {
  console.log("\n=== Etapa 2: dónde entra cada partida en un final ===");
  let semilla = 4242;
  const azar = () => { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; return semilla / 0x7fffffff; };
  const VAL = { q: 9, r: 5, b: 3, n: 3, p: 1 };
  const oraculo = (sec) => {
    const g = new Chess();
    for (let i = 0; i < sec.length; i++) {
      g.move(sec[i]);
      const lado = { w: { v: 0, n: 0, m: 0 }, b: { v: 0, n: 0, m: 0 } };
      g.board().flat().forEach((c) => { if (!c || c.type === "k") return; lado[c.color].m += VAL[c.type]; if (c.type !== "p") { lado[c.color].v += VAL[c.type]; lado[c.color].n += 1; } });
      if (lado.w.v <= 13 && lado.b.v <= 13 && lado.w.n <= 2 && lado.b.n <= 2) return { ply: i + 1, dif: lado.w.m - lado.b.m };
    }
    return null;
  };
  let t = "", esperados = [];
  for (let j = 0; j < 60; j++) {
    const g = new Chess();
    const sec = [];
    for (let k = 0; k < 160 && !g.game_over(); k++) { const ms = g.moves(); const san = ms[Math.floor(azar() * ms.length)]; g.move(san); sec.push(san); }
    esperados.push(oraculo(sec));
    t += '[White "Pedro"]\n[Black "Otro"]\n[Result "1-0"]\n\n' + sec.map((m, i) => (i % 2 === 0 ? (i / 2 + 1) + ". " : "") + m).join(" ") + " 1-0\n\n";
  }
  const lista = A.partidasDelRival(A.leerPgn(t), "pedro");
  igual("60 partidas al azar: el mismo momento y la misma ventaja que con chess.js",
    lista.map((x) => x.final && [x.final.ply, x.final.dif]), esperados.map((e) => e && [e.ply, e.dif]));
  cierto("y hay de todo: con final (" + esperados.filter(Boolean).length + ") y sin final (" + esperados.filter((e) => !e).length + ")",
    esperados.filter(Boolean).length >= 10 && esperados.filter((e) => !e).length >= 5);
}

/* Cómo pierde y el reloj: 20 partidas del rival. Pierde 10: 6 por tiempo y 4
   abandonando; gana 10 abandonando el otro. En todas gasta 2 minutos de 3 en
   sus primeras 15 jugadas (su rival, 20 segundos), y en las que pierde por
   tiempo termina con 2 segundos. */
function pruebaComoPierde() {
  console.log("\n=== Etapa 2: cómo pierde y cómo usa el reloj ===");
  const jugadas = "e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O Re1 a6 a4 h6 Nbd2 Re8 h3 Be6 Bxe6 Rxe6 Nf1 d5 exd5 Qxd5 Ng3 Rd8 Qc2 Qd7 Be3 Bxe3 Rxe3 Nd5 Ree1 Nf4 Rad1 Qd5 Ne4 Nxh3+".split(" ");
  let t = "";
  for (let j = 0; j < 20; j++) {
    const pierde = j < 10;
    const porTiempo = j < 6;
    const cuerpo = jugadas.map((m, i) => {
      const suya = i % 2 === 0;          // Pedro lleva blancas
      const n = Math.floor(i / 2) + 1;
      let clk = suya ? (porTiempo && n >= 19 ? 2 : 180 - (n <= 15 ? n * 8 : 120 + (n - 15) * 2)) : 180 - Math.min(n, 15) * 1.3 - Math.max(0, n - 15);
      clk = Math.round(clk);
      return (suya ? n + ". " : "") + m + " {[%clk 0:" + String(Math.floor(clk / 60)).padStart(2, "0") + ":" + String(clk % 60).padStart(2, "0") + "]}";
    }).join(" ");
    const res = pierde ? "0-1" : "1-0";
    t += '[White "Pedro"]\n[Black "Otro ' + j + '"]\n[Result "' + res + '"]\n[TimeControl "180+0"]\n[Termination "' + (porTiempo ? "Time forfeit" : "Normal") + '"]\n\n' + cuerpo + " " + res + "\n\n";
  }
  const r = A.analizar(A.leerPgn(t), "Pedro");
  const m = r.masAlla;
  igual("cómo terminan sus derrotas", m.derrotas.map((x) => [x.fin, x.n]), [["tiempo", 6], ["abandono", 4]]);
  igual("cuándo pierde: las partidas duran 20 jugadas, así que se deciden en la apertura", m.fases, { apertura: 10, medio: 0, final: 0 });
  cierto("y el FODA dice que la preparación de apertura rinde", r.foda.oportunidades.some((x) => /El 100 % de sus derrotas se decide hasta la jugada 20/.test(x)));
  igual("el reloj: gasta 2/3 de su tiempo en 15 jugadas, su rival menos del 11 %",
    [Math.round(100 * m.reloj.apertura), Math.round(100 * m.reloj.aperturaRivales), Math.round(100 * m.reloj.apuros)], [67, 11, 30]);
  cierto("el FODA lo dice: derrotas por tiempo", r.foda.debilidades.some((x) => /El 60 % de sus derrotas son por tiempo \(6 de 10\)/.test(x)));
  cierto("y el tiempo que gasta en la apertura es una oportunidad", r.foda.oportunidades.some((x) => /gasta más tiempo que sus rivales \(67 % .* contra 11 %\)/.test(x)));
  cierto("y los apuros de tiempo, una debilidad", r.foda.debilidades.some((x) => /apuros de tiempo .* 30 %/.test(x)));
  return r;
}

/* El plan a la medida del alumno (planAlumno en js/preparacion-cruce.js).
   Pedro, con negras: contra 1.e4 saca 40 % en 20 partidas, contra 1.c4 saca
   30 % en 10 (o 0 % en 12, en la segunda prueba) y contra 1.d4, 80 %. Ana
   juega siempre 1.e4, nunca 1.c4. El plan general elige 1.c4 (menos para
   él); el de Ana, 1.e4, que conoce y es casi igual de bueno. Pero si 1.c4 es
   CLARAMENTE mejor, gana aunque Ana no la haya jugado nunca. */
function pgnDeMedida(c4Gana, c4Partidas) {
  let t = "";
  const juega = (n, gana, jugadas) => { for (let i = 0; i < n; i++) t += partida("Otro " + i, "Pedro", i < gana ? "0-1" : "1-0", jugadas); };
  juega(20, 8, "e4 e5 2. Nf3 Nc6");
  juega(c4Partidas, c4Gana, "c4 e5 2. Nc3 Nf6");
  juega(20, 16, "d4 d5 2. c4 e6");
  return t;
}
function pgnDeAna() {
  let t = "";
  for (let i = 0; i < 30; i++) t += partida("Ana", "Otra " + i, i % 3 ? "1-0" : "0-1", "e4 e5 2. Nf3 Nc6");
  return t;
}

function pruebaPlanAMedida() {
  console.log("\n=== El plan a la medida del alumno ===");
  const armar = (c4Gana, c4Partidas) => {
    const lista = A.leerPgn(pgnDeMedida(c4Gana, c4Partidas));
    const r = A.analizar(lista, "Pedro");
    r.cruce = C.cruzar(lista, "Pedro", {}, A.leerPgn(pgnDeAna()), "Ana", { conBlancas: r.conBlancas.plan, conNegras: r.conNegras.plan });
    return r;
  };
  const r = armar(3, 10);
  igual("el plan general elige 1.c4: ahí él saca menos", r.conBlancas.plan[0].san, "c4");
  const medida = L.planDe(r, "conBlancas");
  igual("el de Ana, 1.e4: casi igual de bueno, y lo conoce (30 partidas)", [medida[0].san, medida[0].alumno && medida[0].alumno.n, L.esAMedida(r, "conBlancas")], ["e4", 30, true]);
  cierto("sigue con las respuestas de él (1…e5) y las jugadas de Ana (2.Cf3)", medida[0].hijos[0].san === "e5" && medida[0].hijos[0].hijos[0].san === "Nf3");
  cierto("es el que revisa Stockfish", A.tareasDelMotor(r).some((t) => t.clave === "e4 e5 Nf3" && !t.repertorio));
  igual("es el que se le manda al alumno y el que se baja en PGN", [L.planDelAlumno(r, "conBlancas").plan[0].san, /^1\. e4 /m.test(L.planAPgn(r, "conBlancas"))], ["e4", true]);
  const linea = R.armar(r).lados[0].lineas[0];
  igual("el resumen lo dice, y muestra lo que elegía el general", [linea.titulo, linea.general],
    ["Tu línea, a la medida de Ana", "Sin mirar a Ana, lo que más le cuesta a él es 1.c4 e5 2.Cc3 Cf6: él saca 30,0 % (le va mal) en 10 partidas."]);

  const claro = armar(0, 12);
  igual("pero si 1.c4 es CLARAMENTE mejor (0 de 12), gana aunque Ana no la juegue", L.planDe(claro, "conBlancas")[0].san, "c4");
  const sinCruce = A.analizar(A.leerPgn(pgnDeMedida(3, 10)), "Pedro");
  igual("sin cruce, el plan es el general", [L.planDe(sinCruce, "conBlancas")[0].san, L.esAMedida(sinCruce, "conBlancas")], ["c4", false]);
  const viejo = JSON.parse(JSON.stringify(r));
  delete viejo.cruce.lados.conBlancas.planAlumno;
  igual("un cruce guardado antes (sin planAlumno) usa el general", L.planDe(viejo, "conBlancas")[0].san, "c4");
}

/* Stockfish sobre lo que él juega de verdad (tareasDelMotor + jugadasSuyas).
   Con blancas el plan va por 1.e4: su 1.d4 d5 2.c4 e6 (20 partidas, 90 %)
   no está en el plan, pero sí en lo que él repite, y se revisa igual. */
function pruebaMotorRepertorio() {
  console.log("\n=== Stockfish sobre su repertorio real ===");
  const r = A.analizar(A.leerPgn(pgnDePrueba()), "Pedro Perez");
  cierto("el análisis trae las jugadas que él repite (" + r.jugadasSuyas.length + ")", r.jugadasSuyas.some((x) => x.color === "b" && x.sec.join(" ") === "d4 d5 c4" && x.jugada === "e6" && x.n === 20));
  const tareas = A.tareasDelMotor(r);
  const e6 = tareas.find((t) => t.clave === "d4 d5 c4 e6");
  cierto("Stockfish revisa su 2…e6 aunque el plan no pase por ahí", !!e6 && e6.repertorio && e6.lado === "conBlancas" && e6.quien === "rival");
  cierto("y el plan se sigue revisando entero", tareas.some((t) => t.clave === "e4 e5 Nf3" && !t.repertorio));
  const evals = {};
  tareas.forEach((t) => { evals[t.clave] = { antes: 0.2, mejor: t.jugada, despues: 0.2 }; });
  evals[e6.clave] = { antes: 0.3, mejor: "c6", despues: 1.1 };
  A.aplicarMotor(r, tareas, evals, "prueba");
  igual("si esa jugada suya es un error, aparece", r.motor.errores.map((x) => [A.lineaEs(x.sec.concat(x.jugada)), !!x.repertorio]), [["1.d4 d5 2.c4 e6", true]]);
  igual("y el resumen pide prepararle el castigo, con blancas", R.armar(r).lados[0].haz[0].texto, "Prepara cómo castigar 2…e6: es un error suyo que repite.");
  const viejo = JSON.parse(JSON.stringify(A.analizar(A.leerPgn(pgnDePrueba()), "Pedro Perez")));
  delete viejo.jugadasSuyas;
  cierto("un análisis guardado sin jugadasSuyas usa las líneas de la teoría", A.tareasDelMotor(viejo).some((t) => t.repertorio));
}

/* Qué hacer y qué no hacer (js/preparacion-resumen.js): órdenes cortas con su
   porqué, sacadas de lo que el análisis ya decidió. El rival de prueba tiene
   todo plantado: la Española donde pierde, 1.d4 d5 donde gana, su 4.Dh4 que
   Stockfish (el de mentira) da como error, su 2.Cc3 fuera de la teoría y el
   1.e4 e6 2.d4 d5 donde improvisa. */
function pruebaResumen(conMotor, libro, comoPierde) {
  console.log("\n=== Qué hacer y qué no hacer contra él ===");
  const T = require("../js/preparacion-teoria.js");
  const r = JSON.parse(JSON.stringify(conMotor));
  const datos = {};
  for (let v = 0; v < 40; v++) {
    const faltan = T.pendientes(r, datos);
    if (!faltan.length) break;
    faltan.forEach((f) => { datos[f] = respuestaDelLibro(libro, f); });
  }
  T.aplicar(r, datos);
  const res = R.armar(r);
  const [b, n] = res.lados;
  igual("con blancas, la línea a jugar es la del plan, con cuánto saca él dicho en palabras",
    b.lineas.map((x) => [x.titulo, A.lineaEs(x.sec), x.texto, x.aviso]),
    [["Tu línea", "1.e4 e5 2.Cf3 Cc6 3.Ab5 a6 4.Aa4 Cf6 5.O-O Ae7", "él saca 23,8 % (le va mal) en 21 partidas.", ""]]);
  igual("con negras, una línea por cada apertura suya; si igual le va bien ahí, lo avisa",
    n.lineas.map((x) => [x.titulo, x.texto, !!x.aviso]),
    [["Si abre 1.e4 (63 % de las veces)", "él saca 60,0 % (le va bien) en 20 partidas.", true], ["Si abre 1.d4 (38 % de las veces)", "él saca 83,3 % (le va muy bien) en 12 partidas.", true]]);
  igual("con blancas: cuidado con 1.d4 d5 (1…d5 lo elige él), con el porqué", b.evita.map((x) => [x.texto, x.porque]),
    [["Cuidado si llegan a 1.d4 d5: ahí a él le va muy bien.", "Ahí él saca 90,0 % (le va muy bien) en 20 partidas; con negras suele sacar 56,1 %. Si no la conoces, evita 1.d4."]]);
  igual("y no repite «busca 1.e4 e5»: ya es el comienzo de su línea", b.haz.map((x) => x.texto), []);
  igual("con negras: primero su error, después dónde deja la teoría y dónde improvisa", n.haz.map((x) => x.texto), [
    "Prepara cómo castigar 4.Dh4: es un error suyo que repite.",
    "Estudia 1.d4 c5 2.Cc3: ahí él deja la teoría.",
    "Después de 1.e4 e6 2.d4 d5 no tiene una jugada fija: ahí improvisa."]);
  igual("cada orden trae su porqué y la línea para el tablero", [n.haz[0].porque, n.haz[0].sec.join(" "), n.haz[1].porque],
    ["La jugó en 12 partidas, después de 1.d4 c5 2.Cc3 cxd4 3.Dxd4 Cc6. Stockfish: +0,10 → −0,80; lo correcto era Dd1.", "d4 c5 Nc3 cxd4 Qxd4 Nc6 Qh4",
      "Juega 2.Cc3 en 12 partidas; los maestros, 0 de 100 (lo habitual es d5)."]);
  cierto("toda línea que se ofrece para el tablero es legal", res.lados.every((l) => l.lineas.concat(l.haz, l.evita).every((x) => !x.sec || A.fenDe(x.sec))));
  igual("en toda la partida: llegar con la apertura estudiada", res.general.haz.map((x) => x.texto), ["Llega con la apertura bien estudiada."]);
  igual("el porcentaje en palabras", [0.2, 0.4, 0.5, 0.6, 0.9].map(R.comoLeVa), ["le va mal", "le cuesta", "parejo", "le va bien", "le va muy bien"]);

  const g = R.armar(comoPierde).general;
  igual("el reloj y cómo pierde, como órdenes (de las mismas señales que el FODA)", g.haz.map((x) => x.texto), [
    "Complícale la posición y aprieta el reloj.",
    "Llega con la apertura bien estudiada.",
    "Cuida tu reloj y lleva la partida a lo largo: él se apura al final.",
    "Sácalo de lo que conoce: en la apertura piensa mucho."]);
  igual("con el dato de cada una", g.haz[0].porque, "El 60 % de sus derrotas son por tiempo (6 de 10).");

  /* Lo que salió al probarlo con un rival de verdad (jeigoth5, 500 partidas):
     la línea recomendada era 1.g3 (9 partidas) y los consejos hablaban de
     1.e4 como si fuera tuya la jugada de él («No vayas a 1.e4 g6»), la misma
     idea salía tres veces con una jugada más, y lo del alumno no aparecía. */
  const linea = (sec, color, puntos, n, base) => ({ sec, color, puntos, n, base, g: 0, t: 0, p: 0 });
  const real = {
    minimo: 5,
    conBlancas: { plan: [{ san: "g3", quien: "tu", n: 9, puntos: 0.22, hijos: [{ san: "d5", quien: "rival", n: 8, puntos: 0.25, reparto: 0.89, hijos: [{ san: "Bg2", quien: "tu", n: 8, puntos: 0.25, hijos: [] }] }] }] },
    conNegras: { plan: [] },
    debiles: [linea(["e4", "e6", "d4", "d5", "Nd2", "dxe4", "Nxe4"], "b", 0.29, 7, 0.67), linea(["e4", "e6"], "b", 0.37, 23, 0.67), linea(["e4", "e6", "d4"], "b", 0.39, 14, 0.67)],
    fuertes: [linea(["e4", "Nc6", "d4"], "b", 1, 8, 0.67), linea(["e4", "g6"], "b", 0.93, 14, 0.67), linea(["e4", "g6", "d4"], "b", 0.89, 9, 0.67)],
    improvisa: [],
    cruce: { alumno: "Ana", lados: { conBlancas: { plan: [{ sec: [], recomendada: "g3", veces: 89, total: 986, suya: { san: "d4", n: 653 }, estado: "otra" }], aFavor: [], enContra: [] } } },
  };
  const rb = R.armar(real).lados[0];
  igual("una idea, un consejo: de «1.e4 e6», «…2.d4» y «…3.Cd2 dxe4 4.Cxe4» queda la de más partidas", rb.haz.map((x) => x.texto),
    ["Si llegan a 1.e4 e6, a él le cuesta: estudia esa posición."]);
  igual("lo que elige él no se pide: se avisa; lo que eliges tú, sí («no juegues 2.d4»)", rb.evita.map((x) => x.texto),
    ["Cuidado si llegan a 1.e4 g6: ahí a él le va muy bien.", "No juegues 2.d4 después de 1.e4 Cc6."]);
  igual("y dice cómo evitarla: sin jugar 1.e4", rb.evita[0].porque.endsWith("Si no la conoces, evita 1.e4."), true);
  igual("9 partidas son una pista, y lo dice", rb.lineas[0].aviso, "Son solo 9 partidas: tómalo como pista, no como regla.");
  igual("y si el alumno juega otra cosa ahí, lo dice en la línea", rb.lineas[0].alumno,
    "Ana suele jugar 1.d4 y no 1.g3 (653 contra 89 de 986 partidas): que practique la línea antes.");

  // Un análisis guardado de la versión 1 (sin motor, sin teoría, sin más allá) se resume igual.
  const v1 = R.armar(analisisVersion1());
  cierto("un análisis viejo también se resume, sin romperse", v1.lados.length === 2 && v1.lados[0].lineas.length === 1);
}

// ------------------------------------------------------------ 2. la página

// Un Supabase de mentira. `puede` es lo que contesta puedo_preparar_rivales().
/* `tablas` suma otras tablas con sus filas: los alumnos que ve el profesor
   (profiles), sus Archivos, los planes mandados. Cada insert y cada borrado
   quedan anotados en __insertados / __borrados con su tabla. */
function clienteFalso(puede, guardados, tablas, libro) {
  return `
window.__insertados = [];
window.__borrados = [];
window.__mandados = [];
window.__fensPedidas = [];
(function () {
  const TABLAS = Object.assign({ preparaciones_rival: ${JSON.stringify(guardados || [])} }, ${JSON.stringify(tablas || {})});
  let siguiente = 1;
  function constructor(tabla, filas) {
    let filas2 = (filas || []).slice(), unica = false, quizas = false, insertando = null, borrando = false;
    const b = {
      select() { return b; },
      // «detail->>theme»: un campo dentro de un jsonb, como lo pide PostgREST.
      eq(col, val) {
        const [c, dentro] = col.split("->>");
        filas2 = filas2.filter((r) => String(dentro ? (r[c] || {})[dentro] : r[c]) === String(val));
        return b;
      },
      in(col, vals) { filas2 = filas2.filter((r) => vals.map(String).includes(String(r[col]))); return b; },
      order() { return b; },
      range(a, z) { filas2 = filas2.slice(a, z + 1); return b; },
      insert(fila) {
        insertando = [].concat(fila).map((f) => Object.assign({ id: "p-" + (siguiente++), profesor_id: "u-profe", created_at: "2026-09-28T12:00:00Z" }, f));
        return b;
      },
      delete() { borrando = true; return b; },
      single() { unica = true; return b; },
      maybeSingle() { unica = true; quizas = true; return b; },
      then(res, rej) {
        if (insertando) {
          insertando.forEach((f) => {
            TABLAS[tabla].unshift(f);
            window.__insertados.push(Object.assign({ tabla }, JSON.parse(JSON.stringify(f))));
          });
          filas2 = insertando;
        }
        if (borrando) {
          filas2.forEach((f) => { TABLAS[tabla].splice(TABLAS[tabla].indexOf(f), 1); window.__borrados.push(f.id); });
          filas2 = [];
        }
        let d = filas2;
        if (unica) d = filas2.length ? filas2[0] : null;
        return Promise.resolve({ data: d, error: null }).then(res, rej);
      },
    };
    return b;
  }
  window.sb = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: "u-profe" }, access_token: "t" } } }),
      getUser: () => Promise.resolve({ data: { user: { id: "u-profe" } } }),
      signOut: () => Promise.resolve({}),
    },
    from: (t) => { if (!TABLAS[t]) TABLAS[t] = []; return constructor(t, TABLAS[t]); },
    rpc: (n, args) => {
      if (n === "puedo_preparar_rivales") return Promise.resolve({ data: ${JSON.stringify(puede)}, error: null });
      if (n === "mandar_plan_rival") {
        window.__mandados.push(JSON.parse(JSON.stringify(args)));
        return Promise.resolve({ data: args.p_alumnos.length, error: null });
      }
      return Promise.resolve({ data: [], error: null });
    },
    // La Edge Function explorador-maestros: con un libro, contesta de ahí (lo
    // que no está, vacío, como el explorador); sin libro, como sin el token.
    functions: {
      invoke: (nombre, o) => {
        if (nombre !== "explorador-maestros") return Promise.resolve({ data: null, error: { message: "no existe" } });
        const LIBRO = ${JSON.stringify(libro || null)};
        const fens = o.body.fens;
        window.__fensPedidas.push(...fens);
        if (!LIBRO) return Promise.resolve({ data: { posiciones: {}, faltan: fens, motivo: "sin_token" }, error: null });
        const posiciones = {};
        fens.forEach((f) => { posiciones[f] = LIBRO[f] || { w: 0, d: 0, b: 0, jugadas: [], apertura: null }; });
        // Tarda un poco, como la red: el aviso de «todavía falta» tiene que verse.
        return new Promise((listo) => setTimeout(() => listo({ data: { posiciones, faltan: [], motivo: null }, error: null }), 60));
      },
    },
    channel: () => ({ on() { return this; }, subscribe() { return this; }, track() { return Promise.resolve(); }, presenceState: () => ({}) }),
    removeChannel: () => {},
  };
})();
`;
}

/* Un Stockfish de mentira, con la misma forma que js/shared-engine.js:
   contesta +0,20 en todo, salvo cuando la dama BLANCA está en h4, que da
   −0,80 (el error plantado: 4.Dh4). La mejor jugada es la primera legal que
   no sea Dh4. Con el de verdad, la prueba tardaría minutos y dependería de lo
   que opine el motor en cada versión. */
const MOTOR_FALSO = `
(function () {
  let manejador = null;
  const motor = {
    postMessage(m) {
      if (m.startsWith("position fen ")) { motor._fen = m.slice(13); return; }
      if (m.startsWith("go")) {
        const g = new Chess(motor._fen);
        const q = g.get("h4");
        const blancas = motor._fen.split(" ")[1] === "w";
        const desdeBlancas = q && q.type === "q" && q.color === "w" ? -80 : 20;
        const cp = blancas ? desdeBlancas : -desdeBlancas;
        const mv = g.moves({ verbose: true }).find((x) => !(x.piece === "q" && x.to === "h4"));
        setTimeout(() => {
          window.__motorPedidos = (window.__motorPedidos || 0) + 1;
          manejador && manejador({ data: "info depth 14 score cp " + cp + " pv " + (mv ? mv.from + mv.to : "") });
          manejador && manejador({ data: "bestmove " + (mv ? mv.from + mv.to + (mv.promotion || "") : "(none)") });
        }, 5);
      }
    },
  };
  let cola = Promise.resolve();
  window.SharedEngine = {
    ensureEngine: () => Promise.resolve(motor),
    runTask: (t) => { const r = cola.then(t, t); cola = r.catch(() => null); return r; },
    setMessageHandler: (f) => { manejador = f; },
    discardEngine: () => {},
    PROFUNDIDAD_MAXIMA: 40,
  };
})();
`;

async function abrir(browser, puede, guardados, adaptado, tablas, pagina, libro) {
  const ctx = await browser.newContext({ serviceWorkers: "block", acceptDownloads: true });
  // El cuadro para escribir solo se ve en Modo Adaptado (js/cuadro-comandos.js).
  if (adaptado) await ctx.addInitScript(() => localStorage.setItem("oscarBlindMode_v1", "1"));
  await ctx.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(puede, guardados, tablas, libro) }));
  await ctx.route("**/js/shared-engine.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: MOTOR_FALSO }));
  await ctx.addInitScript(contestarAvisos);
  // «Se ve» se mide con checkVisibility(), no con la clase ni el atributo.
  await ctx.addInitScript(() => { window.SE_VE = (id) => document.getElementById(id).checkVisibility(); });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errores.push("console: " + m.text()); });
  page.on("dialog", (d) => { errores.push("diálogo del navegador: " + d.message()); d.dismiss(); });
  await page.goto(BASE + "/" + (pagina || "preparacion-rivales.html"), { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.getElementById("loading").classList.contains("hidden"), null, { timeout: 15000 });
  return { page, ctx, errores };
}


/* Etapa 1 en la página: las cuentas van al trabajador en segundo plano, los
   filtros vuelven a analizar sin volver a leer, el plan se baja en PGN y un
   análisis guardado antes de todo esto (versión 1) se sigue abriendo. */
async function pruebaEtapa1(browser, viejo) {
  console.log("\n=== En la página: trabajador, filtros, PGN y análisis viejos ===");
  const { page, ctx, errores } = await abrir(browser, true, [{ id: "p-viejo", profesor_id: "u-profe", rival: viejo.rival, partidas: viejo.total, created_at: "2026-09-01T12:00:00Z", analisis: viejo }]);
  const pedidos = [];
  ctx.on("request", (r) => pedidos.push(r.url()));

  await page.setInputFiles("#pgn-archivo", { name: "rival.pgn", mimeType: "application/x-chess-pgn", buffer: Buffer.from(pgnDePrueba(), "utf8") });
  await page.click("#leer");
  await page.waitForFunction(() => /Se leyeron/.test(document.getElementById("leido").textContent), null, { timeout: 10000 });
  await page.click("#analizar");
  await page.waitForFunction(() => /Listo/.test(document.getElementById("motor-estado").textContent), null, { timeout: 30000 });
  igual("las cuentas corren en el trabajador en segundo plano", page.workers().map((w) => w.url().replace(/^.*\/js\//, "js/")).filter((u) => /preparacion/.test(u)), ["js/preparacion-trabajador.js"]);

  igual("se ven los filtros, con lo que el rival tiene", await page.evaluate(() => [SE_VE("filtros"),
    [...document.querySelectorAll('#filtros input[name="filtro-ritmo"]')].map((c) => c.parentElement.textContent + (c.checked ? " ✓" : ""))]),
    [true, ["blitz (73) ✓"]]);
  // Sus partidas son de marzo de 2025: «el último año» no deja ninguna.
  await page.selectOption("#filtro-desde", "1");
  await page.waitForFunction(() => /pasa estos filtros/.test(document.getElementById("resultado-sub").textContent), null, { timeout: 10000 });
  igual("si ningún filtro deja partidas, lo dice y no pinta un análisis vacío",
    [await page.textContent("#resultado-sub"), await page.evaluate(() => document.getElementById("resultado-cuerpo").children.length), await page.evaluate(() => document.getElementById("guardar").disabled)],
    ["Ninguna de sus 73 partidas pasa estos filtros.", 0, true]);
  await page.selectOption("#filtro-desde", "2");
  await page.waitForFunction(() => /^73 partidas/.test(document.getElementById("resultado-sub").textContent) && /Listo/.test(document.getElementById("motor-estado").textContent), null, { timeout: 30000 });
  igual("con «los últimos 2 años» vuelven las 73, con el mismo trabajador (sin volver a leer nada)",
    page.workers().filter((w) => /preparacion-trabajador/.test(w.url())).length, 1);

  const [bajada] = await Promise.all([page.waitForEvent("download"), page.click('[data-pgn="conBlancas"]')]);
  const texto = require("fs").readFileSync(await bajada.path(), "utf8");
  igual("el plan con blancas se baja en PGN", [bajada.suggestedFilename(), texto.split("\n")[0], /\[White "Tú"\]/.test(texto), /^1\. e4 \{/m.test(texto)],
    ["preparacion-pedro-perez-blancas.pgn", '[Event "Preparación contra Pedro Perez"]', true, true]);

  // El análisis guardado antes de la etapa 1: sin filtros ni transposiciones.
  await page.click('#guardados button[aria-label="Abrir el análisis de ' + viejo.rival + '"]');
  await page.waitForFunction((n) => document.getElementById("titulo-resultado").textContent === n, viejo.rival, { timeout: 10000 });
  igual("un análisis de la versión 1 se abre igual, sin filtros (no los tenía)",
    [await page.evaluate(() => SE_VE("filtros")), await page.evaluate(() => [...document.querySelectorAll("#resultado-cuerpo h3")].length >= 5)], [false, true]);
  igual("sin errores en consola ni diálogos del navegador", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

async function pruebaSinPermiso(browser) {
  console.log("\n=== Sin la función activa ===");
  const { page, ctx, errores } = await abrir(browser, false);
  igual("se ve el aviso y no la herramienta", await page.evaluate(() => [SE_VE("denegado"), SE_VE("app")]), [true, false]);
  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

async function pruebaConPermiso(browser) {
  console.log("\n=== Con la función activa: cargar, analizar, revisar y guardar ===");
  const { page, ctx, errores } = await abrir(browser, true);
  igual("se ve la herramienta", await page.evaluate(() => SE_VE("app") && !SE_VE("denegado")), true);
  igual("el paso 2 no se ve antes de leer nada", await page.evaluate(() => SE_VE("paso-rival")), false);

  await page.setInputFiles("#pgn-archivo", { name: "rival.pgn", mimeType: "application/x-chess-pgn", buffer: Buffer.from(pgnDePrueba(), "utf8") });
  await page.click("#leer");
  await page.waitForFunction(() => /Se leyeron/.test(document.getElementById("leido").textContent), null, { timeout: 10000 });
  igual("dice cuántas leyó", await page.textContent("#leido"), "Se leyeron 73 partidas de 42 jugadores.");
  igual("el rival sugerido es el que más partidas tiene", await page.evaluate(() => document.getElementById("rival").selectedOptions[0].textContent), "Pedro Perez — 73 partidas");
  igual("el nombre con marcado queda como texto en la lista", await page.evaluate(() =>
    [document.querySelectorAll("#rival img").length, [...document.querySelectorAll("#rival option")].some((o) => o.textContent.startsWith("<img"))]), [0, true]);

  await page.click("#analizar");
  await page.waitForFunction(() => /Listo/.test(document.getElementById("motor-estado").textContent), null, { timeout: 30000 });
  igual("se ve el resultado, con el nombre como más se escribe en el archivo", await page.evaluate(() => SE_VE("resultado") && document.getElementById("titulo-resultado").textContent), "Pedro Perez");
  igual("el foco va al título del resultado", await page.evaluate(() => document.activeElement.id), "titulo-resultado");
  const titulos = await page.evaluate(() => [...document.querySelectorAll("#resultado-cuerpo h3")].filter((h) => h.checkVisibility()).map((h) => h.textContent));
  igual("están todas las partes, en orden", titulos,
    ["Qué hacer contra él", "Qué jugarle, jugada por jugada", "Lo que dice Stockfish", "Análisis FODA, visto desde quien quiere ganarle", "Más allá de la apertura", "Su repertorio", "Dónde rinde menos y dónde más", "Por ritmo, por año y por Elo"]);
  igual("arriba de todo, qué hacer y qué no, con cada color", await page.evaluate(() => [...document.querySelectorAll("[aria-labelledby='resumen-titulo'] [data-lado] > h4")].map((h) => h.textContent)),
    ["Cuando tú llevas blancas", "Cuando tú llevas negras", "En toda la partida"]);
  igual("con blancas: la línea y lo que no hay que hacer", await page.evaluate(() => {
    const d = document.querySelector("[aria-labelledby='resumen-titulo'] [data-lado='conBlancas']");
    return [d.querySelector("[data-linea] p:nth-child(2)").textContent, d.querySelector("[data-consejos='evita'] li p").textContent];
  }), ["1.e4 e5 2.Cf3 Cc6 3.Ab5 a6 4.Aa4 Cf6 5.O-O Ae7", "Cuidado si llegan a 1.d4 d5: ahí a él le va muy bien."]);
  // Sin el token no hay teoría, y Stockfish ya terminó: el aviso de «todavía
  // falta» no puede quedar colgado (se mide si se ve, no el atributo).
  igual("cuando ya no corre nada, no dice que falta algo", await page.evaluate(() => document.querySelector("[aria-labelledby='resumen-titulo'] [data-pendiente]").checkVisibility()), false);
  igual("en el plan, las cifras solo cuando cambian: «1…e5 (siempre)» va sin repetir las de 1.e4", await page.evaluate(() =>
    [...document.querySelectorAll("[aria-labelledby='planes-titulo'] ul li p")].slice(0, 3).map((p) => p.textContent)),
    ["Juega 1.e4 · él saca 23,8 % (le va mal) en 21 partidas", "Si él juega 1…e5 (siempre)", "Juega 2.Cf3"]);
  cierto("sin relojes en el PGN, «El reloj» lo dice en vez de inventar",
    /no traen los relojes/.test(await page.textContent("[aria-labelledby='masalla-titulo']")));
  igual("el FODA tiene sus cuatro cuadros", await page.evaluate(() =>
    [...document.querySelectorAll("#resultado-cuerpo h4")].map((h) => h.textContent).filter((t) => /^(Fortalezas|Debilidades|Oportunidades|Amenazas)/.test(t)).length), 4);
  igual("el plan con blancas empieza por 1.e4", await page.evaluate(() =>
    document.querySelector("[aria-labelledby='planes-titulo'] ul li p").textContent.replace(/ ·.*/, "")), "Juega 1.e4");
  const errorMotor = await page.evaluate(() => {
    const h = [...document.querySelectorAll("#resultado-cuerpo h4")].find((x) => /Errores que repite/.test(x.textContent));
    return h ? h.nextElementSibling.querySelector("tbody tr").textContent.replace(/\s+/g, " ") : "no está";
  });
  cierto("Stockfish marca su 4.Dh4 (" + errorMotor + ")", /Dh4/.test(errorMotor) && /\+0,20 → −0,80/.test(errorMotor));
  cierto("y el FODA lo trae en Oportunidades", await page.evaluate(() => /suele jugar Dh4/.test(document.getElementById("resultado-cuerpo").textContent)));
  igual("el estado dice cuánto revisó", /Listo: Stockfish 19 lite, profundidad 18, \d+ de \d+ jugadas revisadas\./.test(await page.textContent("#motor-estado")), true);

  // Guardar: va el resultado (con la revisión), no el PGN.
  await page.click("#guardar");
  await page.waitForFunction(() => window.__insertados.length === 1, null, { timeout: 5000 });
  const ins = await page.evaluate(() => { const i = window.__insertados[0]; return { rival: i.rival, partidas: i.partidas, motor: !!i.analisis.motor, total: i.analisis.total, pgn: /\[Event/.test(JSON.stringify(i)) }; });
  igual("se guarda el resultado con la revisión, sin el PGN", ins, { rival: "Pedro Perez", partidas: 73, motor: true, total: 73, pgn: false });
  await page.waitForFunction(() => document.querySelectorAll("#guardados li").length === 1, null, { timeout: 5000 });
  igual("y aparece en «Tus análisis guardados»", await page.evaluate(() => document.querySelector("#guardados li p").textContent), "Pedro Perez");
  igual("el botón dice que ya está guardado", await page.textContent("#guardar"), "Guardado");

  // Eliminarlo pide confirmación con un aviso de la página.
  await page.click("#guardados button[aria-label^='Eliminar']");
  await page.waitForFunction(() => window.__borrados.length === 1, null, { timeout: 5000 });
  await page.waitForFunction(() => document.getElementById("guardados-vacio").checkVisibility(), null, { timeout: 5000 });
  cierto("eliminar pidió confirmar y la lista quedó vacía", await page.evaluate(() => window.__avisos.some((t) => /¿Eliminar este análisis\?/.test(t))));

  igual("el nombre con marcado no se volvió HTML en ningún lado", await page.evaluate(() => document.querySelectorAll("main img").length), 0);
  igual("sin errores en consola ni diálogos del navegador", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

/* Etapa 3: las líneas se ven en un tablero. Una jugada del plan lo abre en esa
   posición con la continuación principal por delante; se recorre con los
   botones, escribiendo y con el lector de pantalla; Stockfish (el doble) dice
   su evaluación en cada paso, y al cerrar el foco vuelve al botón que lo abrió. */
async function pruebaEtapa3(browser) {
  console.log("\n=== Etapa 3: las líneas en un tablero ===");
  const { page, ctx, errores } = await abrir(browser, true, [], true);
  await page.setInputFiles("#pgn-archivo", { name: "rival.pgn", mimeType: "application/x-chess-pgn", buffer: Buffer.from(pgnDePrueba(), "utf8") });
  await page.click("#leer");
  await page.waitForFunction(() => /Se leyeron/.test(document.getElementById("leido").textContent), null, { timeout: 10000 });
  await page.click("#analizar");
  await page.waitForFunction(() => /Listo/.test(document.getElementById("motor-estado").textContent), null, { timeout: 30000 });
  igual("el tablero no se ve antes de pedirlo", await page.evaluate(() => SE_VE("visor-caja")), false);

  // La segunda jugada del plan con blancas: 1.e4 c5 → se abre después de 1…c5.
  const botones = await page.evaluate(() => [...document.querySelectorAll("[aria-labelledby='planes-titulo'] button[aria-label$='ver en el tablero']")].map((b) => b.getAttribute("aria-label")));
  cierto("cada jugada del plan es un botón que dice que abre el tablero (" + botones.slice(0, 3).join(" | ") + ")", botones.length >= 4 && botones[0] === "1.e4, ver en el tablero");
  await page.click("[aria-labelledby='planes-titulo'] button[aria-label='" + botones[1] + "']");
  await page.waitForFunction(() => document.getElementById("visor-caja").checkVisibility(), null, { timeout: 5000 });
  const abierto = await page.evaluate(() => {
    const t = document.querySelector("#visor .visor-tablero");
    const e4 = t.querySelector("[data-square='e4']");
    return {
      titulo: document.querySelector("#visor .visor-titulo").textContent,
      foco: document.activeElement.className,
      casillas: t.querySelectorAll("button.visor-sq").length,
      paradas: [...t.querySelectorAll("button")].filter((b) => b.tabIndex === 0).length,
      e4: e4.textContent.trim() !== "" || !!e4.querySelector("svg, img, span"),
      ultima: [...t.querySelectorAll(".visor-ultima")].map((c) => c.dataset.square).sort(),
    };
  });
  igual("se abre en la posición de esa jugada, con el título de la línea", [abierto.titulo, abierto.ultima], ["El plan: 1.e4 e5", ["e5", "e7"]]);
  igual("el foco va al título del tablero", abierto.foco, "visor-titulo");
  igual("64 casillas y una sola parada de tabulador", [abierto.casillas, abierto.paradas], [64, 1]);
  cierto("el peón de e4 está pintado", abierto.e4);
  await page.waitForFunction(() => /Jugada 2 de/.test(document.querySelector("#visor .visor-escrita").textContent), null, { timeout: 3000 });
  const paso2 = await page.evaluate(() => [document.querySelector("#visor .visor-escrita").textContent, document.querySelector("#visor .visor-nota").textContent]);
  cierto("la jugada va contada, no solo en SAN (" + paso2[0] + ")", /^Jugada 2 de \d+: e5\. El peón negro va de eva 7 a eva 5\.$/.test(paso2[0].replace(/\s+/g, " ")));
  cierto("y con su nota: cuánto la juega y cuánto saca (" + paso2[1] + ")", /^Él la juega el \d+ % de las veces; él saca .* en \d+ partidas\.$/.test(paso2[1]));
  await page.waitForFunction(() => /^Stockfish: /.test(document.querySelector("#visor .visor-motor").textContent), null, { timeout: 5000 });
  igual("Stockfish evalúa la posición que se ve", await page.textContent("#visor .visor-motor"), "Stockfish: +0,20 · lo mejor: a3.");

  // Adelante con el botón, atrás escribiendo.
  await page.click("#visor button[aria-label='Jugada siguiente']");
  await page.waitForFunction(() => /^Jugada 3 de/.test(document.querySelector("#visor .visor-escrita").textContent), null, { timeout: 3000 });
  igual("▶ avanza una jugada y la marca en la lista", await page.evaluate(() => document.querySelector("#visor .visor-jugada[aria-current='step']").textContent), "Cf3");
  await page.fill("#visor .cc-input", "anterior");
  await page.press("#visor .cc-input", "Enter");
  await page.waitForFunction(() => /^Jugada 2 de/.test(document.querySelector("#visor .visor-escrita").textContent), null, { timeout: 3000 });
  cierto("«anterior» escrito vuelve una jugada", true);
  await page.fill("#visor .cc-input", "jugada 1");
  await page.press("#visor .cc-input", "Enter");
  await page.waitForFunction(() => /^Jugada 1 de/.test(document.querySelector("#visor .visor-escrita").textContent), null, { timeout: 3000 });
  cierto("«jugada 1» escrito va a esa jugada", true);
  await page.click("#visor button[aria-label='Ir a la posición inicial']");
  igual("⏮ va a la salida y apaga ◀ y ⏮", await page.evaluate(() => [
    document.querySelector("#visor .sr-only[role='status']").textContent,
    document.querySelector("#visor button[aria-label='Jugada anterior']").disabled,
    document.querySelector("#visor button[aria-label='Ir a la posición inicial']").disabled]), ["Posición de salida.", true, true]);
  await page.fill("#visor .cc-input", "anterior");
  await page.press("#visor .cc-input", "Enter");
  igual("y escribir «anterior» ahí lo dice, sin moverse", await page.textContent("#visor .cc-msg"), "Ya estás en la posición de salida.");
  await page.fill("#visor .cc-input", "evaluación");
  await page.press("#visor .cc-input", "Enter");
  await page.waitForFunction(() => /^Stockfish: /.test(document.querySelector("#visor .cc-msg").textContent), null, { timeout: 5000 });
  cierto("«evaluación» escrita contesta lo de Stockfish", true);

  // Con el teclado en el tablero se va de casilla en casilla, sin salir de él.
  await page.focus("#visor .visor-tablero button[tabindex='0']");
  const antes = await page.evaluate(() => document.activeElement.dataset.square);
  await page.keyboard.press("ArrowRight");
  const despues = await page.evaluate(() => document.activeElement.dataset.square);
  cierto("las flechas mueven el foco por las casillas (" + antes + " → " + despues + ")", !!antes && !!despues && antes !== despues);

  // Cerrar devuelve el foco al botón que lo abrió.
  await page.click("#visor-cerrar");
  igual("al cerrar se oculta y el foco vuelve a la jugada del plan", await page.evaluate(() => [SE_VE("visor-caja"), document.activeElement.getAttribute("aria-label")]), [false, botones[1]]);

  // «Ver» en un error de Stockfish abre esa línea en la jugada del error.
  const ver = await page.$("[aria-labelledby='motor-titulo'] button[aria-label^='Ver en el tablero:']");
  cierto("los errores de Stockfish traen su botón «Ver»", !!ver);
  await ver.click();
  await page.waitForFunction(() => document.getElementById("visor-caja").checkVisibility(), null, { timeout: 5000 });
  const error = await page.evaluate(() => {
    const t = document.querySelector("#visor .visor-tablero");
    return [document.querySelector("#visor .visor-titulo").textContent, t.querySelector(".visor-ultima[data-square='h4']") ? "h4" : "", document.querySelector("#visor .visor-nota").textContent];
  });
  cierto("se abre en su Dh4, con lo que dijo Stockfish (" + error.join(" | ") + ")", /Dh4$/.test(error[0]) && error[1] === "h4" && /^Su error: Dh4 \(\+0,20 → −0,80\)\. Lo mejor era /.test(error[2]));
  await page.waitForFunction(() => /^Stockfish: /.test(document.querySelector("#visor .visor-motor").textContent), null, { timeout: 5000 });
  igual("y Stockfish, en esa posición, da la ventaja", await page.evaluate(() => document.querySelector("#visor .visor-motor").textContent.replace(/ ·.*/, "")), "Stockfish: −0,80");

  // Una jugada que no se puede hacer corta la línea: nunca una posición inventada.
  const cortada = await page.evaluate(() => {
    const d = document.createElement("div");
    document.body.appendChild(d);
    const v = VisorLinea.montar(d, {});
    v.cargar(["e4", "e5", "Ke3", "Nf3"], { titulo: "Prueba" });
    const r = [v.total, v.indice];
    d.remove();
    return r;
  });
  igual("una jugada ilegal corta la línea ahí", cortada, [2, 2]);

  // Otro análisis oculta el tablero de la línea anterior.
  await page.selectOption("#filtro-desde", "2");
  await page.waitForFunction(() => /Listo/.test(document.getElementById("motor-estado").textContent), null, { timeout: 30000 });
  await page.click("#analizar");
  await page.waitForFunction(() => /Listo/.test(document.getElementById("motor-estado").textContent) && !document.getElementById("visor-caja").checkVisibility(), null, { timeout: 30000 });
  cierto("un análisis nuevo oculta el tablero", true);
  igual("sin errores en consola ni diálogos del navegador", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

/* Etapa 5: un «libro de maestros» de mentira, como lo contestaría el
   explorador de Lichess: cada línea con cuántas partidas de maestros la
   jugaron. Por posición (FEN de 4 campos, la clave de
   js/preparacion-posiciones.js): cuántas partidas pasan por ahí y cuántas
   siguieron con cada jugada. Una posición que no está en el libro contesta
   vacía, como la del explorador. */
const LIBRO = [
  ["e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7", 1000],
  ["d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7", 1000],
  ["d4 c5 d5 e5", 100],                     // la Benoni: 2.d5, y 2.Cc3 casi nadie
  ["e4 e6 d4 d5 Nc3 Nf6", 500],
  ["e4 e6 d4 d5 e5 c5", 400],               // 3.e5 c5, no 3…Cf6
  ["e4 e6 d4 d5 exd5 exd5", 300],
  ["e4 e6 d4 d5 Nd2 Nf6", 300],
];
function libroDeMaestros() {
  const T = require("../js/preparacion-teoria.js");
  const datos = {};
  for (const [linea, n] of LIBRO) {
    let e = Pos.inicial();
    for (const san of linea.split(" ")) {
      const k = Pos.clave(e);
      const d = datos[k] || (datos[k] = { w: 0, d: 0, b: 0, jugadas: [], apertura: null });
      d.w += n;
      let j = d.jugadas.find((x) => x.san === san);
      if (!j) { j = { san, uci: "", w: 0, d: 0, b: 0 }; d.jugadas.push(j); }
      j.w += n;
      e = Pos.aplicar(e, san);
    }
  }
  return { datos, T };
}
function respuestaDelLibro(datos, fen) { return datos[fen] || { w: 0, d: 0, b: 0, jugadas: [], apertura: null }; }

function pruebaTeoria() {
  console.log("\n=== Etapa 5: dónde deja la teoría ===");
  const { datos: libro, T } = libroDeMaestros();
  const r = A.analizar(A.leerPgn(pgnDePrueba()), "Pedro Perez");
  const lineas = r.repertorioLineas.map((l) => l.color + " " + l.sec.join(" "));
  cierto("el análisis trae las líneas de su repertorio, por color (" + lineas.length + ")",
    lineas.includes("w d4 c5 Nc3 cxd4 Qxd4 Nc6 Qh4 e6") && lineas.includes("b e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7") && lineas.some((x) => /^w e4 e6 d4 d5 e5/.test(x)));
  igual("y cuántas de sus partidas jugaron cada jugada de la línea", r.repertorioLineas.find((l) => l.sec[1] === "c5").veces, [12, 12, 12, 12, 12, 12, 12, 12]);

  // Por vueltas, como la página: solo lo que falta, y nada después de una salida.
  const preguntadas = [];
  const datos = {};
  for (let v = 0; v < 40; v++) {
    const faltan = T.pendientes(r, datos);
    if (!faltan.length) break;
    faltan.forEach((f) => { preguntadas.push(f); datos[f] = respuestaDelLibro(libro, f); });
  }
  igual("ninguna posición se pregunta dos veces", preguntadas.length, new Set(preguntadas).size);
  let e = Pos.inicial();
  for (const m of ["d4", "c5", "Nc3"]) e = Pos.aplicar(e, m);
  cierto("y no se pregunta nada después de que la línea deja la teoría (" + preguntadas.length + " posiciones)", !preguntadas.includes(Pos.clave(e)));

  T.aplicar(r, datos);
  const salida = (sec) => { const l = r.teoria.lineas.find((x) => x.sec.join(" ").startsWith(sec)); return l && l.salida && [l.salida.ply, l.salida.quien, l.salida.jugada, l.salida.maestros, l.salida.total, l.salida.alternativas.map((a) => a.san)]; };
  igual("con blancas, 1.d4 c5 2.Cc3: la deja él, con 0 de 100 partidas de maestros; lo habitual es d5", salida("d4 c5"), [2, "el", "Nc3", 0, 100, ["d5"]]);
  igual("1.e4 e6 2.d4 d5 3.e5 Cf6: la deja su rival", salida("e4 e6 d4 d5 e5"), [5, "rival", "Nf6", 0, 400, ["c5"]]);
  const espanola = r.teoria.lineas.find((l) => l.color === "b" && l.sec[0] === "e4");
  igual("la Española con negras es teoría de punta a punta", [espanola.salida, espanola.completa], [null, true]);

  A.rehacerFoda(r);
  cierto("al FODA: una oportunidad con la posición a estudiar", r.foda.oportunidades.some((x) =>
    /Con blancas, después de 1\.d4 c5 juega Cc3 \(12 partidas\), que los maestros casi no juegan \(0 de 100\); lo habitual es d5\. Ahí deja la teoría/.test(x)));

  // La Edge Function valida cada FEN con su propia expresión regular: tiene que
  // aceptar todas las claves que arma la página (con enroques, al paso, las
  // dos manos), y rechazar lo que no es una posición.
  const fuente = require("fs").readFileSync(require("path").join(__dirname, "..", "supabase", "functions", "explorador-maestros", "index.ts"), "utf8");
  const FEN = new RegExp(fuente.match(/const FEN = \/(.+)\/;/)[1]);
  const claves = new Set(preguntadas);
  let eFen = Pos.inicial();
  for (const m of ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "a6", "Be3", "e5", "Nb3", "Be6", "f3", "Be7", "Qd2", "O-O", "O-O-O"]) { claves.add(Pos.clave(eFen)); eFen = Pos.aplicar(eFen, m); }
  const rechazadas = [...claves].filter((f) => !FEN.test(f));
  igual("la función acepta todas las posiciones que le pregunta la página (" + claves.size + ")", rechazadas, []);
  igual("y rechaza lo que no es una posición", ["", "x", "<script>/8/8/8/8/8/8/8 w - -", "8/8/8/8/8/8/8/8 w KQkq", "8/8/8/8/8/8/8/8 x - -"].filter((f) => FEN.test(f)), []);

  // Sin respuestas del explorador (sin token), ninguna línea se da por revisada.
  const r2 = A.analizar(A.leerPgn(pgnDePrueba()), "Pedro Perez");
  T.aplicar(r2, {});
  igual("sin respuestas, ninguna línea queda como revisada ni inventa una salida", [r2.teoria.faltan, r2.teoria.lineas.some((l) => l.salida)], [r2.teoria.lineas.length, false]);
  return libro;
}

/* Etapa 6: una alumna de mentira. Con blancas juega 1.e4 e5 2.Cf3 Cc6 3.Ac4
   (el plan dice 3.Ab5) y 1.d4 d5 2.c4, donde el rival saca 90 %; contra 1.e4
   saca 24 %. Con negras contesta 1.d4 con c5, que es lo que dice el plan. */
function pgnDeAlumna() {
  let t = "";
  for (let i = 0; i < 10; i++) t += partida("Ana Alumna", "X" + i, i < 7 ? "1-0" : "0-1", "e4 e5 2. Nf3 Nc6 3. Bc4 Bc5");
  for (let i = 0; i < 8; i++) t += partida("Ana Alumna", "Y" + i, i < 4 ? "1-0" : "0-1", "d4 d5 2. c4 e6 3. Nc3 Nf6");
  for (let i = 0; i < 6; i++) t += partida("Z" + i, "Ana Alumna", i < 3 ? "1-0" : "0-1", "d4 c5 2. d5 e5");
  return t;
}

function pruebaCruce() {
  console.log("\n=== Etapa 6: el cruce con las partidas del alumno ===");
  const C = require("../js/preparacion-cruce.js");
  const rival = A.leerPgn(pgnDePrueba());
  const r = A.analizar(rival, "Pedro Perez");
  const planes = { conBlancas: r.conBlancas.plan, conNegras: r.conNegras.plan };
  const c = C.cruzar(rival, "Pedro Perez", {}, A.leerPgn(pgnDeAlumna()), "Ana Alumna", planes);
  igual("encuentra a la alumna y sus partidas por color", [c.alumno, c.total, c.lados.conBlancas.partidas, c.lados.conNegras.partidas], ["Ana Alumna", 24, 18, 6]);
  const b = c.lados.conBlancas;
  igual("con blancas, del plan ya juega 1.e4 y 2.Cf3", b.plan.filter((x) => x.estado === "la-juega").map((x) => x.recomendada), ["e4", "Nf3"]);
  const otra = b.plan.find((x) => x.estado === "otra");
  igual("y en la jugada 3 juega otra cosa: 3.Ac4 en vez de 3.Ab5, 10 de 10", [otra.sec.join(" "), otra.recomendada, otra.suya], ["e4 e5 Nf3 Nc6", "Bb5", { san: "Bc4", n: 10 }]);
  igual("lo que sigue del plan, no lo alcanzó nunca", b.plan.filter((x) => x.estado === "nunca").length, 2);
  igual("juega lo suyo: contra su 1.e4 el rival saca 23,8 %", b.aFavor.map((x) => [x.sec.concat(x.jugada).join(" "), x.alumno.n, A.pct(x.rival.puntos)]), [["e4", 10, "23,8 %"]]);
  igual("ojo: contra su 1.d4 saca 90 %", b.enContra.map((x) => [x.sec.concat(x.jugada).join(" "), x.alumno.n, A.pct(x.rival.puntos)]), [["d4", 8, "90,0 %"]]);
  const n = c.lados.conNegras;
  igual("con negras, contra 1.d4 ya juega 1…c5, como dice el plan", n.plan.filter((x) => x.sec.join(" ") === "d4").map((x) => [x.recomendada, x.estado]), [["c5", "la-juega"]]);
  // Con los filtros del análisis: sin partidas del rival que pasen, nada que cruzar.
  const f = C.cruzar(rival, "Pedro Perez", { ritmos: ["clásica"] }, A.leerPgn(pgnDeAlumna()), "Ana Alumna", planes);
  igual("con filtros que dejan al rival sin partidas, no inventa encuentros", [f.lados.conBlancas.comunes, f.lados.conBlancas.aFavor.length], [0, 0]);
  igual("un alumno que no está en el archivo da null", C.cruzar(rival, "Pedro Perez", {}, A.leerPgn(pgnDeAlumna()), "Nadie", planes), null);
}

/* Etapa 4, sin navegador: lo que se le manda al alumno es SOLO el plan de un
   lado y lo que dijo Stockfish de sus jugadas; cada línea del plan sale en su
   propio PGN, que chess.js lee y que llega a donde dice el camino. */
function pruebaPlanDelAlumno(r) {
  console.log("\n=== Etapa 4: lo que se le manda al alumno ===");
  const p = L.planDelAlumno(r, "conNegras");
  igual("solo el plan y el motor, nada más del análisis", Object.keys(p).sort(), ["motor", "plan"]);
  const texto = JSON.stringify(p);
  cierto("sin el FODA, el repertorio ni el otro lado", !/foda|repertorio|conBlancas|fortalezas|primeras|contra/i.test(texto));
  const clavesDelPlan = new Set();
  (function bajar(nodos, antes) { for (const x of nodos) { const sec = antes.concat(x.san); clavesDelPlan.add(sec.join(" ")); bajar(x.hijos || [], sec); } })(p.plan, []);
  const delMotor = p.motor.errores.concat(p.motor.cuidado).map((x) => x.sec.concat(x.jugada).join(" "));
  cierto("lo de Stockfish es solo de jugadas del plan, y trae su Dh4 (" + delMotor.join(" | ") + ")", delMotor.length > 0 && delMotor.every((k) => clavesDelPlan.has(k)) && delMotor.some((k) => /Qh4$/.test(k)));
  const todas = r.motor.errores.concat(r.motor.cuidado).filter((x) => clavesDelPlan.has(x.sec.concat(x.jugada).join(" "))).length;
  igual("y no se pierde ninguna que sí es del plan", delMotor.length, todas);

  const lineas = L.lineasDelPlan(r.conNegras.plan);
  cierto("el plan con negras tiene varias líneas (" + lineas.length + ")", lineas.length >= 2);
  const malas = lineas.filter((c) => {
    const g = new Chess();
    if (!g.load_pgn(L.lineaAPgn(r, "conNegras", c), { sloppy: true })) return true;
    return g.history().join(" ") !== c.map((x) => x.san).join(" ");
  });
  igual("cada línea en PGN la lee chess.js y llega a su última jugada", malas.length, 0);
}

/* Etapa 4 en la página: mandar el plan a un alumno (una sola llamada, con solo
   el plan) y guardarlo en Archivos, una fila por línea, reemplazando lo de
   antes. Y la página del alumno: el plan, el tablero y nada del análisis. */
async function pruebaEtapa4(browser) {
  console.log("\n=== Etapa 4: mandar el plan al alumno y a Archivos ===");
  const alumnos = [
    { id: "a-1", full_name: "Ana Alumna", email: "ana@x.com", role: "alumno" },
    { id: "a-2", full_name: "Beto Alumno", email: "beto@x.com", role: "alumno" },
    { id: "u-colega", full_name: "Una Profe", email: "p@x.com", role: "profesor" },
  ];
  const { page, ctx, errores } = await abrir(browser, true, [], false, { profiles: alumnos });
  await page.setInputFiles("#pgn-archivo", { name: "rival.pgn", mimeType: "application/x-chess-pgn", buffer: Buffer.from(pgnDePrueba(), "utf8") });
  await page.click("#leer");
  await page.waitForFunction(() => /Se leyeron/.test(document.getElementById("leido").textContent), null, { timeout: 10000 });
  await page.click("#analizar");
  await page.waitForFunction(() => /Listo/.test(document.getElementById("motor-estado").textContent), null, { timeout: 30000 });
  igual("cada plan trae sus tres acciones", await page.evaluate(() =>
    [...document.querySelectorAll("[aria-labelledby='planes-titulo'] [data-pgn], [aria-labelledby='planes-titulo'] [data-mandar], [aria-labelledby='planes-titulo'] [data-archivar]")].map((b) => b.textContent)),
    ["Bajar el plan con blancas (PGN)", "Mandárselo a un alumno", "Guardar en Archivos (para la clase)",
     "Bajar el plan con negras (PGN)", "Mandárselo a un alumno", "Guardar en Archivos (para la clase)"]);

  // Mandar.
  await page.click('[data-mandar="conBlancas"]');
  await page.waitForFunction(() => document.getElementById("mandar-caja").checkVisibility() && document.querySelectorAll(".mandar-check").length > 0, null, { timeout: 5000 });
  igual("se abre la caja, con el foco en su título", await page.evaluate(() => [document.getElementById("mandar-titulo").textContent, document.activeElement.id]),
    ["Mandar el plan con blancas contra Pedro Perez", "mandar-titulo"]);
  igual("la lista trae solo cuentas de alumno", await page.evaluate(() => [...document.querySelectorAll(".mandar-check")].map((c) => c.value)), ["a-1", "a-2"]);
  igual("revisado con Stockfish, no avisa que falta la revisión", await page.evaluate(() => SE_VE("mandar-sin-motor")), false);
  cierto("la fecha límite viene puesta, en el futuro", await page.evaluate(() => new Date(document.getElementById("mandar-vence").value) > new Date()));
  await page.click("#mandar-enviar");
  igual("sin marcar a nadie, lo dice y no manda nada", await page.evaluate(() => [document.getElementById("mandar-estado").textContent, window.__mandados.length]), ["Marca al menos un alumno.", 0]);
  await page.check('.mandar-check[value="a-2"]');
  await page.fill("#mandar-nota", "Mira bien la 3.");
  await page.click("#mandar-enviar");
  await page.waitForFunction(() => window.__mandados.length === 1, null, { timeout: 5000 });
  const mandado = await page.evaluate(() => window.__mandados[0]);
  igual("una sola llamada, con el alumno, el lado y la nota", [mandado.p_alumnos, mandado.p_lado, mandado.p_rival, mandado.p_nota], [["a-2"], "conBlancas", "Pedro Perez", "Mira bien la 3."]);
  igual("lo que viaja es solo el plan", Object.keys(mandado.p_plan).sort(), ["motor", "plan"]);
  cierto("sin nada del análisis", !/foda|repertorio|conNegras|primeras|masAlla/i.test(JSON.stringify(mandado.p_plan)));
  igual("y dice que se mandó", await page.textContent("#mandar-estado"), "Plan mandado a 1 alumno, con su tarea.");
  await page.click("#mandar-cerrar");
  igual("al cerrar, el foco vuelve al botón", await page.evaluate(() => [SE_VE("mandar-caja"), document.activeElement.dataset.mandar]), [false, "conBlancas"]);

  // A Archivos, dos veces: la segunda reemplaza. Con negras, que tiene varias líneas.
  await page.click('[data-archivar="conNegras"]');
  await page.waitForFunction(() => window.__insertados.filter((i) => i.tabla === "archivos_pgn").length > 0, null, { timeout: 5000 });
  const archivos = await page.evaluate(() => window.__insertados.filter((i) => i.tabla === "archivos_pgn"));
  cierto("una fila por línea del plan (" + archivos.length + "), en la carpeta del rival",
    archivos.length >= 2 && archivos.every((a) => a.carpeta === "Preparación: Pedro Perez" && a.profesor_id === "u-profe" && /^Con negras · 1\.(e4|d4) /.test(a.titulo)));
  const malas = archivos.filter((a) => {
    const g = new Chess();
    if (!g.load_pgn(a.pgn, { sloppy: true })) return true;
    return g.history().length !== a.move_count || g.fen() !== a.fen_final;
  });
  igual("cada PGN se lee y trae bien sus jugadas y su posición final", malas.length, 0);
  cierto("preguntó antes, diciendo dónde queda", await page.evaluate(() => window.__avisos.some((t) => /Se guardan \d+ líneas en la carpeta «Preparación: Pedro Perez»\. En la clase en vivo aparecen en 📁 Archivos\./.test(t))));
  const primeras = archivos.map((a) => a.id);
  await page.click('[data-archivar="conNegras"]');
  await page.waitForFunction((n) => window.__borrados.length === n, primeras.length, { timeout: 5000 });
  igual("guardarlo otra vez reemplaza: se borran las de antes y quedan las nuevas", await page.evaluate((ids) => [
    window.__borrados.slice().sort().join() === ids.slice().sort().join(),
    window.__insertados.filter((i) => i.tabla === "archivos_pgn").length,
    window.__avisos.some((t) => /ya hay \d+ líneas de este plan\. Se reemplazan/.test(t))], primeras), [true, 2 * primeras.length, true]);
  igual("sin errores en consola ni diálogos del navegador", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();

  // La página del alumno, con el plan que se mandó.
  console.log("\n=== Etapa 4: la página del alumno ===");
  const fila = { id: "plan-1", profesor_id: "u-profe", alumno_id: "a-2", rival: "Pedro Perez", lado: "conBlancas", plan: mandado.p_plan, nota: "Mira bien la 3.", created_at: "2026-09-28T12:00:00Z" };
  const al = await abrir(browser, false, [], false, { planes_rival_alumno: [fila] }, "plan-rival.html?id=plan-1");
  const pedidos = [];
  al.ctx.on("request", (q) => pedidos.push(q.url()));
  igual("se ve el plan con su título, la fecha y la nota del profe", await al.page.evaluate(() => [SE_VE("app"), document.getElementById("titulo").textContent,
    document.getElementById("subtitulo").textContent, document.getElementById("nota").textContent]),
    [true, "Tu plan contra Pedro Perez", "Con blancas · te lo mandaron el 28 de septiembre de 2026.", "Mira bien la 3."]);
  cierto("sin nada del análisis: ni FODA, ni repertorio, ni Stockfish en vivo", await al.page.evaluate(() =>
    !/Fortalezas|Debilidades|Su repertorio|Más allá de la apertura/.test(document.body.textContent) && !window.SharedEngine));
  igual("el tablero arranca en la línea principal, en la salida", await al.page.evaluate(() =>
    [document.querySelector("#visor .visor-titulo").textContent, document.querySelector("#visor .sr-only[role='status']").textContent]), ["La línea principal", "Posición de salida."]);
  await al.page.click("#plan button[aria-label='1…e5, ver en el tablero']");
  await al.page.waitForFunction(() => /^Jugada 2 de/.test(document.querySelector("#visor .visor-escrita").textContent), null, { timeout: 3000 });
  igual("una jugada del plan abre su línea en el tablero, con su nota", await al.page.evaluate(() =>
    [document.querySelector("#visor .visor-titulo").textContent, /^Él la juega el \d+ %/.test(document.querySelector("#visor .visor-nota").textContent), document.activeElement.className]),
    ["1.e4 e5", true, "visor-titulo"]);
  const [bajada] = await Promise.all([al.page.waitForEvent("download"), al.page.click("#bajar-pgn")]);
  const pgn = require("fs").readFileSync(await bajada.path(), "utf8");
  igual("el alumno baja el plan en PGN", [bajada.suggestedFilename(), /\[Black "Pedro Perez"\]/.test(pgn), /1\. e4/.test(pgn)], ["plan-pedro-perez-blancas.pgn", true, true]);
  igual("sin errores", al.errores.join(" | ") || "ninguno", "ninguno");
  await al.ctx.close();

  // La sesión del doble es «u-profe»: acá hace de alumno.
  const lista = await abrir(browser, false, [], false, { planes_rival_alumno: [Object.assign({}, fila, { alumno_id: "u-profe" }), Object.assign({}, fila, { id: "plan-otro", alumno_id: "otro" })] }, "plan-rival.html");
  igual("sin id, la lista con sus planes (los de otro alumno no, aunque llegaran)", await lista.page.evaluate(() =>
    [...document.querySelectorAll("#lista-planes a")].map((a) => [a.getAttribute("href"), a.querySelector("p").textContent])),
    [["plan-rival.html?id=plan-1", "Contra Pedro Perez, con blancas"]]);
  await lista.ctx.close();
  const nada = await abrir(browser, false, [], false, { planes_rival_alumno: [] }, "plan-rival.html?id=no-existe");
  igual("un plan que no está lo dice", await nada.page.evaluate(() => [SE_VE("no-esta"), SE_VE("app")]), [true, false]);
  await nada.ctx.close();
}

/* Etapa 5 en la página: al analizar, la página le pregunta a la Edge Function
   (el doble contesta del libro de mentira) y pinta dónde deja la teoría, con
   su tablero; sin el token del servidor, lo dice y no pinta nada. */
async function pruebaEtapa5(browser, libro) {
  console.log("\n=== Etapa 5: dónde deja la teoría, en la página ===");
  const analizarEn = async (page, conLibro) => {
    await page.setInputFiles("#pgn-archivo", { name: "rival.pgn", mimeType: "application/x-chess-pgn", buffer: Buffer.from(pgnDePrueba(), "utf8") });
    await page.click("#leer");
    await page.waitForFunction(() => /Se leyeron/.test(document.getElementById("leido").textContent), null, { timeout: 10000 });
    await page.click("#analizar");
    // Apenas empiezan Stockfish y la teoría, el resumen avisa que se va a
    // completar (antes de que ninguno termine y vuelva a pintar).
    if (conLibro) await page.waitForFunction(() => { const p = document.querySelector("[aria-labelledby='resumen-titulo'] [data-pendiente]"); return p && p.checkVisibility() && /Stockfish.* y la comparación con los maestros/.test(p.textContent); }, null, { timeout: 5000 });
    await page.waitForFunction(() => /Listo/.test(document.getElementById("motor-estado").textContent) && /^Comparado|falta el token/.test(document.getElementById("teoria-estado").textContent), null, { timeout: 30000 });
  };

  const { page, ctx, errores } = await abrir(browser, true, [], false, {}, null, libro);
  await analizarEn(page, true);
  const pedidas = await page.evaluate(() => window.__fensPedidas);
  igual("se pregunta cada posición una sola vez", pedidas.length, new Set(pedidas).size);
  cierto("el estado dice cuántas posiciones comparó (" + await page.textContent("#teoria-estado") + ")", /^Comparado con las partidas de maestros de Lichess \(\d+ posiciones\)\.$/.test(await page.textContent("#teoria-estado")));
  cierto("se ve la tarjeta, después de la de Stockfish", await page.evaluate(() => {
    const hs = [...document.querySelectorAll("#resultado-cuerpo h3")].filter((h) => h.checkVisibility()).map((h) => h.textContent);
    return hs.indexOf("Dónde deja la teoría") === hs.indexOf("Lo que dice Stockfish") + 1;
  }));
  const renglones = (clave) => page.evaluate((k) => {
    const li = document.querySelector("[aria-labelledby='teoria-titulo'] li[data-teoria='" + k + "']");
    return li ? [...li.querySelectorAll("p")].map((p) => p.textContent) : null;
  }, clave);
  igual("1.d4 c5 2.Cc3: la deja él, en 12 partidas; los maestros, 0 de 100, juegan d5", await renglones("d4 c5 Nc3"),
    ["1.d4 c5 2.Cc3", "Él la deja en la jugada 2, con Cc3 (12 partidas suyas).", "Los maestros la jugaron 0 veces de 100. Lo que juegan ellos: d5 (100 %)."]);
  igual("3.e5 Cf6: la deja su rival", (await renglones("e4 e6 d4 d5 e5 Nf6"))[1], "Su rival la deja en la jugada 3, con Cf6 (5 partidas suyas).");
  igual("la Española con negras sigue a los maestros hasta el final", (await renglones("e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7"))[1], "No la deja: sigue a los maestros hasta la jugada 5 (20 partidas suyas).");
  await page.click("[aria-labelledby='teoria-titulo'] button[aria-label='Ver en el tablero: 1.d4 c5 2.Cc3']");
  await page.waitForFunction(() => document.getElementById("visor-caja").checkVisibility(), null, { timeout: 5000 });
  igual("«Ver» abre el tablero en la jugada donde la deja, con lo que dicen los maestros", await page.evaluate(() =>
    [document.querySelector("#visor .visor-titulo").textContent, document.querySelector("#visor .visor-nota").textContent]),
    ["1.d4 c5 2.Cc3", "Aquí él deja la teoría con Cc3: los maestros la jugaron 0 veces de 100. Lo habitual es d5."]);
  cierto("al FODA llega la posición a estudiar", await page.evaluate(() => /juega Cc3 \(12 partidas\), que los maestros casi no juegan \(0 de 100\)/.test(document.getElementById("resultado-cuerpo").textContent)));
  cierto("y el FODA sigue trayendo lo de Stockfish", await page.evaluate(() => /suele jugar Dh4/.test(document.getElementById("resultado-cuerpo").textContent)));
  igual("el resumen, con negras: su error, dónde deja la teoría y dónde improvisa", await page.evaluate(() =>
    [...document.querySelectorAll("[aria-labelledby='resumen-titulo'] [data-lado='conNegras'] [data-consejos='haz'] li p:first-child")].map((p) => p.textContent)), [
    "Prepara cómo castigar 4.Dh4: es un error suyo que repite.",
    "Estudia 1.d4 c5 2.Cc3: ahí él deja la teoría.",
    "Después de 1.e4 e6 2.d4 d5 no tiene una jugada fija: ahí improvisa."]);
  await page.click("[aria-labelledby='resumen-titulo'] [data-lado='conNegras'] [data-consejos='haz'] li button");
  await page.waitForFunction(() => document.getElementById("visor-caja").checkVisibility(), null, { timeout: 5000 });
  igual("su «Ver» abre el tablero en el error, con el consejo y su porqué", await page.evaluate(() =>
    [document.querySelector("#visor .visor-titulo").textContent, /^Prepara cómo castigar 4\.Dh4.*Stockfish: \+0,20 → −0,80/.test(document.querySelector("#visor .visor-nota").textContent)]),
    ["1.d4 c5 2.Cc3 cxd4 3.Dxd4 Cc6 4.Dh4", true]);
  await page.click("#visor-cerrar");
  // Lo ya revisado no se vuelve a pedir: cuando el plan cambia (llega el
  // cruce), Stockfish revisa solo lo nuevo.
  igual("Stockfish no vuelve a revisar lo que ya revisó: solo lo que falta", await page.evaluate(async (pgn) => {
    const A = PreparacionAnalisis, M = PreparacionMotor;
    const r = A.analizar(A.leerPgn(pgn), "Pedro Perez");
    let antes = window.__motorPedidos || 0;
    let res = await M.revisar(r, {});
    A.aplicarMotor(r, res.tareas, res.evals, res.detalle);
    const primera = (window.__motorPedidos || 0) - antes;
    const faltaban = M.faltan(r);
    r.motor.lineas = r.motor.lineas.filter((x) => x.sec.concat(x.jugada).join(" ") !== "d4 c5 Nc3 cxd4 Qxd4 Nc6 Qh4");
    const faltaUna = M.faltan(r);
    antes = window.__motorPedidos;
    res = await M.revisar(r, {});
    return [primera > 10, faltaban, faltaUna, window.__motorPedidos - antes, res.hechas === res.total, res.evals["d4 c5 Nc3 cxd4 Qxd4 Nc6 Qh4"].despues];
  }, pgnDePrueba()), [true, 0, 1, 2, true, -0.8]);
  igual("y al terminar todo, no queda el aviso de que falta algo", await page.evaluate(() => document.querySelector("[aria-labelledby='resumen-titulo'] [data-pendiente]").checkVisibility()), false);
  await page.click("#guardar");
  await page.waitForFunction(() => window.__insertados.some((i) => i.tabla === "preparaciones_rival"), null, { timeout: 5000 });
  igual("se guarda con la teoría", await page.evaluate(() => { const i = window.__insertados.find((x) => x.tabla === "preparaciones_rival"); return [!!i.analisis.teoria, i.analisis.teoria.lineas.length > 0, i.analisis.version]; }), [true, true, 4]);
  igual("sin errores en consola ni diálogos del navegador", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();

  const sin = await abrir(browser, true, [], false, {}, null, null);
  await analizarEn(sin.page);
  igual("sin el token del servidor, lo dice y no pinta la tarjeta", await sin.page.evaluate(() => [
    /falta el token de Lichess en el servidor \(LICHESS_TOKEN\)/.test(document.getElementById("teoria-estado").textContent),
    !!document.querySelector("[aria-labelledby='teoria-titulo']")]), [true, false]);
  igual("sin errores", sin.errores.join(" | ") || "ninguno", "ninguno");
  await sin.ctx.close();
}

/* Etapa 6 en la página: bajar las partidas de la alumna por su usuario (un
   Lichess de mentira), cruzar sola, pintar la tarjeta y guardarla con el
   análisis; con otros filtros se vuelve a cruzar sola, y un análisis guardado
   de otro rival no cruza con las partidas que quedaron cargadas. */
async function pruebaEtapa6(browser) {
  console.log("\n=== Etapa 6: el cruce con el alumno, en la página ===");
  const { page, ctx, errores } = await abrir(browser, true, [{ id: "p-otro", profesor_id: "u-profe", rival: "Otro Rival", partidas: 73, created_at: "2026-09-01T12:00:00Z", analisis: Object.assign(analisisVersion1(), { rival: "Otro Rival" }) }]);
  const pedidos = [];
  await servirSitios(ctx, pedidos);
  await page.setInputFiles("#pgn-archivo", { name: "rival.pgn", mimeType: "application/x-chess-pgn", buffer: Buffer.from(pgnDePrueba(), "utf8") });
  await page.click("#leer");
  await page.waitForFunction(() => /Se leyeron/.test(document.getElementById("leido").textContent), null, { timeout: 10000 });
  await page.click("#analizar");
  await page.waitForFunction(() => /Listo/.test(document.getElementById("motor-estado").textContent), null, { timeout: 30000 });
  igual("se ve la caja para cruzar con el alumno", await page.evaluate(() => SE_VE("alumno-caja")), true);

  await page.fill("#alumno-usuario", "AnaAlumna");
  await page.click("#alumno-bajar");
  await page.waitForFunction(() => /^Listo: /.test(document.getElementById("alumno-estado").textContent), null, { timeout: 15000 });
  cierto("se piden las partidas de la alumna a Lichess", pedidos.some((u) => /\/api\/games\/user\/AnaAlumna\?/.test(u)));
  igual("y el foco va a la tarjeta del cruce", await page.evaluate(() => [document.getElementById("alumno-estado").textContent, document.activeElement.id]), ["Listo: AnaAlumna, 24 partidas.", "cruce-titulo"]);
  const renglones = (clave) => page.evaluate((k) => {
    const li = document.querySelector("[aria-labelledby='cruce-titulo'] li[data-cruce='" + k + "']");
    return li ? [...li.querySelectorAll("p")].map((p) => p.textContent) : null;
  }, clave);
  cierto("con blancas: del plan ya juega 2, en 1 juega otra cosa y a 2 no llegó", await page.evaluate(() =>
    /El plan: de 5 jugadas que le tocan, ya juega 2; en 1 juega otra cosa; a 2 no llegó en sus partidas\./.test(document.querySelector("[aria-labelledby='cruce-titulo']").textContent)));
  igual("la jugada donde se aparta del plan", await renglones("e4 e5 Nf3 Nc6 Bb5"), ["1.e4 e5 2.Cf3 Cc6 3.Ab5", "El plan dice 3.Ab5; tu alumno juega 3.Ac4 (10 de 10)."]);
  igual("juega lo suyo: 1.e4", await renglones("e4"), ["1.e4", "Tu alumno saca 70,0 % en 10 partidas; él saca 23,8 % en 21 partidas (su promedio con ese color: 56,1 %)."]);
  cierto("con negras, lo que es cero no se dice", await page.evaluate(() =>
    /El plan: de 9 jugadas que le tocan, ya juega 1; a 8 no llegó en sus partidas\./.test(document.querySelector("[aria-labelledby='cruce-titulo']").textContent)));
  igual("ojo: 1.d4", (await renglones("d4"))[1], "Tu alumno saca 50,0 % en 8 partidas; él saca 90,0 % en 20 partidas (su promedio con ese color: 56,1 %).");
  await page.click("[aria-labelledby='cruce-titulo'] button[aria-label='Ver en el tablero: 1.e4 e5 2.Cf3 Cc6 3.Ab5']");
  await page.waitForFunction(() => document.getElementById("visor-caja").checkVisibility(), null, { timeout: 5000 });
  igual("«Ver» abre el tablero con lo que juega el alumno", await page.textContent("#visor .visor-nota"), "El plan: Ab5. Tu alumno suele jugar Ac4 (10 de 10).");

  await page.click("#guardar");
  await page.waitForFunction(() => window.__insertados.some((i) => i.tabla === "preparaciones_rival"), null, { timeout: 5000 });
  igual("se guarda con el cruce", await page.evaluate(() => window.__insertados.find((i) => i.tabla === "preparaciones_rival").analisis.cruce.alumno), "AnaAlumna");

  // Otros filtros: se vuelve a cruzar solo, con la misma alumna. El estado se
  // vacía antes, para no confundir el «Listo» de antes con uno nuevo.
  await page.evaluate(() => { document.getElementById("alumno-estado").textContent = ""; });
  await page.selectOption("#filtro-desde", "2");
  await page.waitForFunction(() => /^Listo: AnaAlumna/.test(document.getElementById("alumno-estado").textContent) && !!document.querySelector("[aria-labelledby='cruce-titulo']"), null, { timeout: 30000 });
  cierto("con otros filtros se vuelve a cruzar solo", true);

  // Un análisis guardado de otro rival: no se cruza con las partidas de este.
  await page.click('#guardados button[aria-label="Abrir el análisis de Otro Rival"]');
  await page.waitForFunction(() => document.getElementById("titulo-resultado").textContent === "Otro Rival", null, { timeout: 10000 });
  await page.click("#alumno-cruzar");
  cierto("un análisis guardado de otro rival no se cruza con las partidas cargadas", await page.evaluate(() =>
    /un análisis guardado no las trae/.test(document.getElementById("alumno-estado").textContent) && !document.querySelector("[aria-labelledby='cruce-titulo']")));
  igual("sin errores en consola ni diálogos del navegador", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

/* Etapa 7: el alumno entrena el plan en plan-rival.html. Un plan chico, de dos
   líneas (1.e4 e5 2.Cf3 y 1.e4 c5). Se juega con clics y escribiendo; una
   jugada que no es la del plan se deshace y cuenta; la línea con errores o
   pistas queda registrada SIN theme (no cuenta para la tarea) y la limpia CON
   theme = el id del plan. Con negras, el tablero se da vuelta. Un profesor que
   mira el plan de su alumno no suma nada. */
const PLAN_CHICO = { plan: [{ san: "e4", quien: "tu", n: 5, puntos: 0.2, hijos: [
  { san: "e5", quien: "rival", reparto: 0.6, n: 3, puntos: 0.3, hijos: [{ san: "Nf3", quien: "tu", n: 3, puntos: 0.1, hijos: [] }] },
  { san: "c5", quien: "rival", reparto: 0.4, n: 2, puntos: 0.5, hijos: [] }] }], motor: null };

async function pruebaEtapa7(browser) {
  console.log("\n=== Etapa 7: entrenar el plan ===");
  const fila = { id: "plan-7", profesor_id: "p-x", alumno_id: "u-profe", rival: "Pedro Perez", lado: "conBlancas", plan: PLAN_CHICO, nota: null, created_at: "2026-09-28T12:00:00Z" };
  const { page, ctx, errores } = await abrir(browser, false, [], false, { planes_rival_alumno: [fila], training_progress: [] }, "plan-rival.html?id=plan-7");
  igual("dice cuántas líneas ya le salen", await page.textContent("#entrenar-progreso"), "Te salen sin errores 0 de 2 líneas.");
  igual("una fila por línea, con su botón", await page.evaluate(() => [...document.querySelectorAll("#entrenar-lineas li")].map((li) => li.dataset.linea)), ["e4 e5 Nf3", "e4 c5"]);

  const tocar = async (a, b) => { await page.click("#entrenador [data-square='" + a + "']"); await page.click("#entrenador [data-square='" + b + "']"); };
  const turno = () => page.textContent("#entrenador .entrenador-turno");
  await page.click("#entrenar-siguiente");
  await page.waitForFunction(() => document.getElementById("entrenador-caja").checkVisibility(), null, { timeout: 5000 });
  igual("se abre el entrenador, con el foco en su título", await page.evaluate(() => [document.querySelector("#entrenador .visor-titulo").textContent, document.activeElement.className]), ["Línea 1 de 2", "visor-titulo"]);
  igual("le toca a él, con blancas", await turno(), "Te toca: juegas con blancas.");
  igual("con blancas, el tablero empieza en a8", await page.evaluate(() => document.querySelector("#entrenador .visor-tablero button").dataset.square), "a8");
  // Una jugada legal que no es la del plan: se deshace y cuenta.
  await tocar("d2", "d4");
  igual("una jugada que no es la del plan se deshace y lo dice", await page.evaluate(() => [
    document.querySelector("#entrenador .visor-nota").textContent, !!document.querySelector("#entrenador [data-square='d4'] span")]),
    ["Esa no es la jugada del plan. Vuelve a intentarlo.", false]);
  await tocar("e2", "e4");
  await page.waitForFunction(() => /^Te toca/.test(document.querySelector("#entrenador .entrenador-turno").textContent), null, { timeout: 5000 });
  cierto("el rival contesta solo, y se dice qué jugó (" + await page.textContent("#entrenador .visor-nota") + ")",
    /^El rival: El peón negro va de eva 7 a eva 5\. Él la juega el 60 % de las veces/.test(await page.textContent("#entrenador .visor-nota")));
  await tocar("g1", "f3");
  await page.waitForFunction(() => /Línea completa/.test(document.querySelector("#entrenador .entrenador-turno").textContent), null, { timeout: 5000 });
  await page.waitForFunction(() => window.__insertados.some((i) => i.tabla === "training_progress"), null, { timeout: 5000 });
  igual("con un error: lo dice, y se registra sin theme (no cuenta para la tarea)", await page.evaluate(() => {
    const i = window.__insertados.filter((x) => x.tabla === "training_progress")[0];
    return [document.getElementById("entrenador-resultado").textContent, i.activity, i.detail.linea_id, i.detail.limpio, i.detail.theme || null];
  }), ["Te salió con 1 error y 0 pistas: vuelve a jugarla hasta que te salga limpia.", "preparacion", "plan-7:e4 e5 Nf3", false, null]);
  igual("y todavía no cuenta", await page.textContent("#entrenar-progreso"), "Te salen sin errores 0 de 2 líneas.");

  // Otra vez, limpia.
  await page.click("#entrenador button:has-text('Empezar de nuevo')");
  await tocar("e2", "e4");
  await page.waitForFunction(() => /^Te toca/.test(document.querySelector("#entrenador .entrenador-turno").textContent), null, { timeout: 5000 });
  await tocar("g1", "f3");
  await page.waitForFunction(() => window.__insertados.filter((i) => i.tabla === "training_progress").length === 2, null, { timeout: 5000 });
  igual("limpia: cuenta, con theme = el id del plan", await page.evaluate(() => {
    const i = window.__insertados.filter((x) => x.tabla === "training_progress")[1];
    return [document.getElementById("entrenador-resultado").textContent, i.detail.limpio, i.detail.theme];
  }), ["¡Te salió sin errores ni pistas! Esta línea ya cuenta.", true, "plan-7"]);
  await page.waitForFunction(() => /1 de 2/.test(document.getElementById("entrenar-progreso").textContent), null, { timeout: 5000 });
  cierto("y el progreso sube a 1 de 2, con la línea marcada", await page.evaluate(() =>
    /✔ Ya te sale sin errores/.test(document.querySelector("#entrenar-lineas li[data-linea='e4 e5 Nf3']").textContent)));

  // La siguiente es la que falta; con pista no cuenta.
  await page.click("#entrenar-siguiente");
  await page.waitForFunction(() => document.querySelector("#entrenador .visor-titulo").textContent === "Línea 2 de 2", null, { timeout: 5000 });
  await page.click("#entrenador button:has-text('Pista')");
  igual("la pista dice la jugada y marca de dónde sale", await page.evaluate(() => [
    document.querySelector("#entrenador .visor-nota").textContent, document.querySelector("#entrenador [data-square='e2']").classList.contains("visor-seleccionada")]),
    ["La jugada del plan es e4. Hazla en el tablero.", true]);
  await tocar("e2", "e4");
  await page.waitForFunction(() => window.__insertados.filter((i) => i.tabla === "training_progress").length === 3, null, { timeout: 5000 });
  igual("con pista no cuenta", await page.evaluate(() => { const i = window.__insertados.filter((x) => x.tabla === "training_progress")[2]; return [i.detail.linea_id, i.detail.pistas, i.detail.theme || null]; }), ["plan-7:e4 c5", 1, null]);
  igual("sin errores", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();

  // Con negras y en Modo Adaptado: el tablero se da vuelta y se juega escribiendo.
  const negras = Object.assign({}, fila, { id: "plan-8", lado: "conNegras", plan: { plan: [{ san: "e4", quien: "rival", reparto: 1, n: 5, puntos: 0.5, hijos: [{ san: "c5", quien: "tu", n: 5, puntos: 0.4, hijos: [] }] }], motor: null } });
  const n = await abrir(browser, false, [], true, { planes_rival_alumno: [negras], training_progress: [] }, "plan-rival.html?id=plan-8");
  await n.page.click("#entrenar-siguiente");
  await n.page.waitForFunction(() => /^Te toca: juegas con negras/.test((document.querySelector("#entrenador .entrenador-turno") || {}).textContent || ""), null, { timeout: 5000 });
  igual("con negras, el rival abre solo y el tablero empieza en h1", await n.page.evaluate(() => document.querySelector("#entrenador .visor-tablero button").dataset.square), "h1");
  await n.page.fill("#entrenador .cc-input", "c5");
  await n.page.press("#entrenador .cc-input", "Enter");
  await n.page.waitForFunction(() => window.__insertados.some((i) => i.tabla === "training_progress"), null, { timeout: 5000 });
  igual("escribiendo «c5» se juega y la línea sale limpia", await n.page.evaluate(() => { const i = window.__insertados.find((x) => x.tabla === "training_progress"); return [i.detail.linea_id, i.detail.theme]; }), ["plan-8:e4 c5", "plan-8"]);
  await n.ctx.close();

  // Un profesor que mira el plan de su alumno: no suma nada.
  const ajeno = Object.assign({}, fila, { alumno_id: "otro-alumno" });
  const p = await abrir(browser, false, [], false, { planes_rival_alumno: [ajeno], training_progress: [] }, "plan-rival.html?id=plan-7");
  igual("un profesor que lo mira lo sabe", await p.page.textContent("#entrenar-progreso"), "Estás viendo el plan de un alumno: lo que entrenes acá no se le suma.");
  await p.page.click("#entrenar-siguiente");
  await p.page.click("#entrenador [data-square='e2']"); await p.page.click("#entrenador [data-square='e4']");
  await p.page.waitForFunction(() => /^Te toca/.test(document.querySelector("#entrenador .entrenador-turno").textContent), null, { timeout: 5000 });
  await p.page.click("#entrenador [data-square='g1']"); await p.page.click("#entrenador [data-square='f3']");
  await p.page.waitForFunction(() => /Línea completa/.test(document.querySelector("#entrenador .entrenador-turno").textContent), null, { timeout: 5000 });
  igual("y no se registra nada", await p.page.evaluate(() => window.__insertados.filter((i) => i.tabla === "training_progress").length), 0);
  await p.ctx.close();
}

// Las partidas «de Lichess»: las mismas de prueba, con el rival como usuario.
function pgnDeUsuario(usuario) {
  return pgnDePrueba().replace(/Pérez, Pedro|Pedro Perez|Pedro Pérez|PEDRO PÉREZ/g, usuario);
}

/* Lichess y Chess.com de mentira. Contestan con CORS abierto, como los de
   verdad: sin esa cabecera el navegador ni deja leer la respuesta. Se anota
   cada pedido para saber qué se pidió y en qué orden. */
async function servirSitios(ctx, pedidos) {
  const cors = { "Access-Control-Allow-Origin": "*" };
  await ctx.route("https://lichess.org/api/games/user/**", (r) => {
    pedidos.push(r.request().url());
    if (/\/user\/nadie\?/.test(r.request().url())) return r.fulfill({ status: 404, headers: cors, body: "" });
    if (/\/user\/AnaAlumna\?/.test(r.request().url())) return r.fulfill({ status: 200, headers: Object.assign({ "Content-Type": "application/x-chess-pgn" }, cors), body: pgnDeAlumna().replace(/Ana Alumna/g, "AnaAlumna") });
    return r.fulfill({ status: 200, headers: Object.assign({ "Content-Type": "application/x-chess-pgn" }, cors), body: pgnDeUsuario("PedroP") });
  });
  const todo = pgnDeUsuario("pedrop").split(/\n\n(?=\[Event )/);
  const mitad = Math.ceil(todo.length / 2);
  await ctx.route("https://api.chess.com/pub/player/**", (r) => {
    const url = r.request().url();
    pedidos.push(url);
    if (/\/games\/archives$/.test(url)) {
      return r.fulfill({ status: 200, headers: Object.assign({ "Content-Type": "application/json" }, cors),
        body: JSON.stringify({ archives: ["https://api.chess.com/pub/player/pedrop/games/2026/08", "https://api.chess.com/pub/player/pedrop/games/2026/09"] }) });
    }
    // Septiembre (el más nuevo) trae la primera mitad; agosto, el resto.
    const cuerpo = /2026\/09\/pgn$/.test(url) ? todo.slice(0, mitad).join("\n\n") : todo.slice(mitad).join("\n\n");
    return r.fulfill({ status: 200, headers: Object.assign({ "Content-Type": "application/x-chess-pgn" }, cors), body: cuerpo });
  });
}

async function pruebaDescarga(browser) {
  console.log("\n=== Bajar las partidas con el usuario de Lichess o Chess.com ===");
  const { page, ctx, errores } = await abrir(browser, true);
  const pedidos = [];
  await servirSitios(ctx, pedidos);

  // Un usuario inválido no se pide.
  await page.fill("#bajar-usuario", "no vale!");
  await page.click("#bajar");
  cierto("un usuario inválido se explica y no se pide nada", /tal como sale en su perfil/.test(await page.textContent("#bajar-estado")) && pedidos.length === 0);

  // Lichess: baja, elige al usuario como rival y analiza solo.
  await page.fill("#bajar-usuario", "PedroP");
  await page.selectOption("#bajar-maximo", "500");
  await page.click("#bajar");
  await page.waitForFunction(() => /Listo/.test(document.getElementById("motor-estado").textContent), null, { timeout: 30000 });
  igual("a Lichess se le pide ese usuario, con el tope elegido, con relojes y sin evaluaciones",
    pedidos.map((u) => { const x = new URL(u); return x.pathname + " max=" + x.searchParams.get("max") + " clocks=" + x.searchParams.get("clocks") + " evals=" + x.searchParams.get("evals"); }),
    ["/api/games/user/PedroP max=500 clocks=true evals=false"]);
  igual("y analiza solo, con el usuario como rival", [await page.textContent("#titulo-resultado"), await page.evaluate(() => document.getElementById("rival").value)], ["PedroP", "PedroP"]);
  cierto("con todas sus partidas", /^73 partidas/.test(await page.textContent("#resultado-sub")));

  // Un usuario que no existe: se dice, en palabras.
  await page.fill("#bajar-usuario", "nadie");
  await page.click("#bajar");
  await page.waitForFunction(() => /No existe/.test(document.getElementById("bajar-estado").textContent), null, { timeout: 10000 });
  igual("un usuario que no existe se dice", await page.textContent("#bajar-estado"), "No existe el usuario «nadie» en Lichess.");

  // El 404 de «nadie» lo anota el navegador en la consola por su cuenta: es
  // el pedido que falló, no un error de la página.
  const errores404 = errores.filter((e) => /status of 404/.test(e));
  errores.splice(0, errores.length, ...errores.filter((e) => !errores404.includes(e)));

  // Chess.com: los meses, del más nuevo al más viejo.
  pedidos.length = 0;
  await page.check("#bajar-chesscom");
  await page.fill("#bajar-usuario", "PedroP");
  await page.selectOption("#bajar-maximo", "0");
  await page.evaluate(() => { document.getElementById("motor-estado").textContent = ""; document.getElementById("titulo-resultado").textContent = ""; });
  await page.click("#bajar");
  await page.waitForFunction(() => /Listo/.test(document.getElementById("motor-estado").textContent), null, { timeout: 30000 });
  igual("a Chess.com se le pide la lista de meses y cada mes, del más nuevo al más viejo",
    pedidos.map((u) => u.replace("https://api.chess.com/pub/player/", "")),
    ["pedrop/games/archives", "pedrop/games/2026/09/pgn", "pedrop/games/2026/08/pgn"]);
  igual("y analiza las de los dos meses, con el nombre como sale en las partidas",
    [await page.textContent("#titulo-resultado"), /^73 partidas/.test(await page.textContent("#resultado-sub"))], ["pedrop", true]);

  // Con un tope que ya se juntó en el mes más nuevo, no se pide el siguiente
  // y sale justo esa cantidad.
  pedidos.length = 0;
  const bajadas = await page.evaluate(async () => {
    const t = await window.PreparacionDescarga.descargar({ sitio: "chesscom", usuario: "pedrop", maximo: 10 });
    return window.PreparacionDescarga.contarPartidas(t);
  });
  igual("con tope 10: diez partidas y sin pedir agosto", [bajadas, pedidos.length], [10, 2]);

  igual("sin errores en consola ni diálogos del navegador", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

// La CSP tiene que dejar pedir a los dos sitios: sin eso, en producción la
// descarga falla aunque acá funcione (el servidor de prueba no manda _headers).
function pruebaCsp() {
  console.log("\n=== La CSP deja bajar de Lichess y Chess.com ===");
  const h = require("fs").readFileSync(require("path").join(__dirname, "..", "_headers"), "utf8");
  const politica = (h.match(/^\s*Content-Security-Policy: (.+)$/m) || [])[1] || "";
  const connect = ((politica.match(/connect-src ([^;]+);/) || [])[1] || "").split(/\s+/);
  igual("connect-src tiene los dos", ["https://lichess.org", "https://api.chess.com"].filter((x) => !connect.includes(x)), []);
}

/* El motor de verdad: Stockfish 19 lite, solo en esta página.
   Los archivos son los del paquete de npm `stockfish` 19.0.0 (de Nathan Rugg,
   el que usa Chess.com), sin tocar: se comparan por su huella. Y el resto del
   sitio sigue con Stockfish 16, porque el bot está calibrado con ese. */
const HUELLAS_SF19 = {
  "js/vendor/stockfish/stockfish-19-lite-single.js": "d3344124ab067fb0b90ee77873bb8e9fbf5fc01bc525fe714b0f942581e889e6",
  "js/vendor/stockfish/stockfish-19-lite-single.wasm": "57ac2d72312aba346760e3f173f687a8c211208e97a87268436f7f0e10bb5387",
};

function pruebaArchivosDelMotor() {
  console.log("\n=== Stockfish 19 lite: los archivos y quién lo usa ===");
  const fs = require("fs"), path = require("path"), crypto = require("crypto");
  const raiz = path.join(__dirname, "..");
  for (const [f, h] of Object.entries(HUELLAS_SF19)) {
    const ruta = path.join(raiz, f);
    const hallada = fs.existsSync(ruta) ? crypto.createHash("sha256").update(fs.readFileSync(ruta)).digest("hex") : "no existe";
    igual(f + " es el de npm, sin tocar", hallada, h);
  }
  // Solo esta página pide otro motor; las demás, el de siempre.
  const conMotor = [];
  (function recorrer(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (["node_modules", ".git", "herramientas"].includes(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) recorrer(p);
      else if (e.name.endsWith(".html") && /data-motor=/.test(fs.readFileSync(p, "utf8"))) conMotor.push(path.relative(raiz, p));
    }
  })(raiz);
  igual("solo preparacion-rivales.html pide otro motor", conMotor, ["preparacion-rivales.html"]);
  const compartido = fs.readFileSync(path.join(raiz, "js/shared-engine.js"), "utf8");
  cierto("el motor por defecto sigue siendo Stockfish 16", /MOTOR_POR_DEFECTO = "stockfish-nnue-16-single\.js"/.test(compartido));
}

// En un navegador de verdad: la página carga el 19 y contesta.
async function pruebaMotorDeVerdad(browser) {
  console.log("\n=== Stockfish 19 lite, corriendo en la página ===");
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(true) }));
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.goto(BASE + "/preparacion-rivales.html", { waitUntil: "networkidle" });
  const r = await page.evaluate(async () => {
    const motor = await SharedEngine.ensureEngine();
    if (!motor) return { url: SharedEngine.URL, error: "no cargó" };
    const lineas = [];
    return new Promise((res) => {
      const t = setTimeout(() => res({ url: SharedEngine.URL, error: "sin respuesta", lineas }), 30000);
      SharedEngine.setMessageHandler((ev) => {
        const l = String(ev.data);
        lineas.push(l);
        if (l.startsWith("bestmove")) { clearTimeout(t); res({ url: SharedEngine.URL, nombre: lineas.find((x) => x.startsWith("id name")), mejor: l.split(" ")[1] }); }
      });
      motor.postMessage("uci");
      motor.postMessage("position fen r1bqkbnr/pp1ppppp/2n5/8/3Q4/2N5/PPP1PPPP/R1B1KBNR w KQkq - 1 4");
      motor.postMessage("go depth 12");
    });
  });
  igual("la página carga el motor 19 lite", String(r.url).replace(/^.*\/js\//, "js/"), "js/vendor/stockfish/stockfish-19-lite-single.js");
  igual("y el motor se presenta como Stockfish 19", r.nombre, "id name Stockfish 19 Lite WASM");
  cierto("y contesta una jugada legal (" + r.mejor + ")", !!A.fenDe([]) && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(String(r.mejor)));
  igual("sin errores en la página", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

(async () => {
  const conMotor = pruebaAnalisis();
  pruebaPosiciones();
  pruebaDatosPorPartida();
  pruebaTransposiciones();
  pruebaFiltros();
  pruebaPgnDelPlan(conMotor);
  pruebaPlanDelAlumno(conMotor);
  const libro = pruebaTeoria();
  pruebaCruce();
  pruebaTiposDeFinal();
  pruebaDeteccionDeFinales();
  pruebaResumen(conMotor, libro, pruebaComoPierde());
  pruebaPlanAMedida();
  pruebaMotorRepertorio();
  pruebaCsp();
  pruebaArchivosDelMotor();
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaSinPermiso(browser);
    await pruebaConPermiso(browser);
    await pruebaDescarga(browser);
    await pruebaEtapa1(browser, analisisVersion1());
    await pruebaEtapa3(browser);
    await pruebaEtapa4(browser);
    await pruebaEtapa5(browser, libro);
    await pruebaEtapa6(browser);
    await pruebaEtapa7(browser);
    await pruebaMotorDeVerdad(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nLa preparación de rivales está como se pidió.");
  process.exit(fallos ? 1 : 0);
})();
