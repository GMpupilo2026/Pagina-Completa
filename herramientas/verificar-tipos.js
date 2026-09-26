/* Comprueba los bancos de los Tipos de entrenamiento (entreno/data/tipos.json)
 * y las reglas que los corrigen (js/tipos-reglas.js), sin navegador.
 *
 * Lo que se promete en cada tipo se vuelve a comprobar acá, con las mismas
 * reglas que juega el alumno:
 *   - El Detective: la opción buena ES posible (hay una posición anterior legal
 *     que lleva a la de la pantalla) y cada una de las otras NO lo es, por el
 *     motivo que dice su explicación.
 *   - ¿Qué quiere el rival?: el tablero del alumno y el del rival son la misma
 *     posición con el turno cambiado, las dos legales; la amenaza es una jugada
 *     legal; si promete mate en 1 es mate, y si promete mate en 2, chess.js lo
 *     demuestra jugada por jugada.
 *   - Descarte: toda candidata es legal, hay de las dos clases, y las que
 *     «pierden» quedan 2,5 peones o más por debajo de la peor que «aguanta».
 *   - Siete diferencias: A y B difieren EXACTAMENTE en las casillas del
 *     cambio, el golpe es legal en las dos, lo que el motor dijo (gana en A,
 *     ya no en B) cumple los cortes y la refutación es legal en B.
 *   - La balanza: el material guardado es el de la posición y cada una cumple
 *     el criterio de su nivel.
 *   - Fotografía: la cantidad de piezas es la de la posición y cae en el rango
 *     del nivel; las respuestas de las preguntas se vuelven a calcular.
 *   - Con lo justo: la distancia al mate de cada final se recalcula ENTERA con
 *     herramientas/lib/finales-dtm.js (tarda un minuto: son las tablas de 4
 *     piezas) y tiene que dar exactamente el mínimo que dice la página.
 *
 *   - Los tipos 8 a 14 (Barrido, Intercambios, Constrúyela tú, Rey y peón,
 *     el maestro, ¿Qué apertura es?, la Ruta segura): se vuelve a correr la
 *     regla de js/tipos-reglas-mas.js y tiene que dar lo mismo que el banco;
 *     la tabla de rey y peón se recalcula entera y se compara bit a bit, y
 *     las jugadas del maestro se comparan con la partida del curso.
 *
 * El motor no se vuelve a correr acá (en el CI no hay Stockfish): lo que dijo
 * se comprobó al generar, en herramientas/tipos-generar.js.
 *
 * Uso: node herramientas/verificar-tipos.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { Chess } = require("chess.js");
const R = require("../js/tipos-reglas.js");
const C = require("../js/tipos-catalogo.js");
const FinalesDTM = require("./lib/finales-dtm.js");

const RAIZ = path.join(__dirname, "..");
const DATOS = JSON.parse(fs.readFileSync(path.join(RAIZ, "entreno/data/tipos.json"), "utf8"));

let fallos = 0, pruebas = 0;
function ok(nombre, cond, detalle) {
  pruebas++;
  if (cond) return;
  fallos++;
  console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : ""));
}
function titulo(t) { console.log("\n=== " + t + " ==="); }
function legal(fen) { const g = new Chess(); return g.load(fen) ? g : null; }
const VALOR = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
function material(fen) { let v = 0; R.tablero(fen).forEach((p) => { if (p) v += (p.c === "w" ? 1 : -1) * VALOR[p.t]; }); return v; }

/* ---------- el catálogo y los niveles ---------- */
titulo("Catálogo y niveles");
const ids = new Set();
C.TIPOS.forEach((t) => {
  const items = DATOS[t.id];
  ok(t.id + ": el banco existe", Array.isArray(items) && items.length > 0);
  if (!items) return;
  t.niveles.forEach((n) => {
    const cuantos = items.filter((x) => x.nivel === n.n).length;
    const minimo = t.id === "con-lo-justo" ? 4 : 10;
    ok(t.id + " nivel " + n.n + ": al menos " + minimo + " ejercicios", cuantos >= minimo, "tiene " + cuantos);
  });
  items.forEach((x) => {
    ok(t.id + ": nivel declarado en el catálogo (" + x.id + ")", !!C.nivel(t.id, x.nivel));
    ok("id repetido: " + x.id, !ids.has(t.id + ":" + x.id));
    ids.add(t.id + ":" + x.id);
    // el maestro trae solo el índice en el banco público (sus posiciones, abajo)
    if (t.id !== "maestro") ok(t.id + ": FEN legal (" + x.id + ")", !!legal(x.fen), x.fen);
  });
});
console.log("  " + ids.size + " ejercicios en " + C.TIPOS.length + " tipos");

/* ---------- 1. El Detective ---------- */
titulo("El Detective");
DATOS.detective.forEach((x) => {
  const g = legal(x.fen);
  ok("el rey está en jaque (" + x.id + ")", g && g.in_check());
  ok("opciones según el nivel (" + x.id + ")", x.opciones.length === (x.nivel === 1 ? 3 : 4), "tiene " + x.opciones.length);
  const claves = x.opciones.map(R.claveRetro);
  ok("una sola opción buena, y está (" + x.id + ")", claves.filter((k) => k === x.correcta).length === 1);
  ok("las etiquetas no se repiten (" + x.id + ")", new Set(x.opciones.map(R.etiquetaRetro)).size === x.opciones.length);
  x.opciones.forEach((op) => {
    const r = R.retro(Chess, x.fen, op);
    if (R.claveRetro(op) === x.correcta) {
      ok("la buena es posible: " + R.etiquetaRetro(op) + " (" + x.id + ")", r.posible);
      // y lleva de verdad a la posición de la pantalla
      if (r.posible) {
        const g2 = new Chess(r.antes);
        const m = g2.move({ from: op.de, to: op.a, promotion: op.tipo === "corona" ? op.p : undefined });
        ok("la buena reproduce la posición (" + x.id + ")", m && g2.fen().split(" ")[0] === x.fen.split(" ")[0]);
      }
    } else {
      ok("la mala es imposible: " + R.etiquetaRetro(op) + " (" + x.id + ")", !r.posible);
      ok("y por el motivo que dice (" + x.id + ")", r.motivo === op.motivo, "dice " + op.motivo + ", da " + r.motivo);
    }
  });
});
// nivel 3: la jugada fue a la descubierta (la pieza que se movió no da jaque)
DATOS.detective.filter((x) => x.nivel === 3).forEach((x) => {
  const op = x.opciones.find((o) => R.claveRetro(o) === x.correcta);
  const g = new Chess(R.colocacion(R.tablero(x.fen)) + " " + R.otro(x.fen.split(" ")[1]) + " - - 0 1");
  const rey = R.tablero(x.fen).findIndex((p) => p && p.t === "k" && p.c === x.fen.split(" ")[1]);
  const daJaque = g.moves({ verbose: true, legal: false }).some((m) => m.from === op.a && m.to === R.sq(rey));
  ok("nivel 3 es a la descubierta (" + x.id + ")", !daJaque);
});

/* ---------- 2. ¿Qué quiere el rival? ---------- */
titulo("¿Qué quiere el rival?");
function mateEnDos(fen, san) {
  const g = new Chess(fen);
  if (!g.move(san)) return false;
  if (g.in_checkmate()) return true;
  const defensas = g.moves();
  if (!defensas.length) return false;       // ahogado
  return defensas.every((d) => {
    g.move(d);
    const mate = g.moves().some((m) => { g.move(m); const e = g.in_checkmate(); g.undo(); return e; });
    g.undo();
    return mate;
  });
}
DATOS.amenaza.forEach((x) => {
  ok("misma posición, turno cambiado (" + x.id + ")", x.fen.split(" ")[0] === x.fenRival.split(" ")[0] && x.fen.split(" ")[1] !== x.fenRival.split(" ")[1]);
  const yo = legal(x.fen), riv = legal(x.fenRival);
  ok("el alumno no está en jaque (" + x.id + ")", yo && !yo.in_check());
  ok("el rival tampoco (" + x.id + ")", riv && !riv.in_check());
  const g = new Chess(x.fenRival);
  const m = g.move(x.amenaza);
  ok("la amenaza es legal (" + x.id + ")", !!m);
  ok("y su castellano es el que se muestra (" + x.id + ")", R.sanEs(x.amenaza) === x.amenazaEs);
  if (x.mate === 1) ok("promete mate en 1 y es mate (" + x.id + ")", g.in_checkmate());
  if (x.mate === 2) ok("promete mate en 2 y lo es (" + x.id + ")", mateEnDos(x.fenRival, x.amenaza));
  if (x.nivel === 2) ok("nivel 2 promete mate en 1 (" + x.id + ")", x.mate === 1);
  if (x.nivel === 4) ok("nivel 4 promete mate en 2 (" + x.id + ")", x.mate === 2);
  if (x.nivel === 5 && m) ok("nivel 5 es tranquila: sin jaque ni captura (" + x.id + ")", !m.captured && !/[+#]/.test(m.san));
  if (x.nivel === 1 && m) ok("nivel 1 se come algo (" + x.id + ")", !!m.captured);
  // la regla de la página: la amenaza cuenta, otra jugada cualquiera no
  ok("amenazaAcertada acepta la amenaza (" + x.id + ")", R.amenazaAcertada(Chess, x, x.amenaza).ok);
  const otra = new Chess(x.fenRival).moves().find((s) => s !== x.amenaza && !(x.mate === 1 && (() => { const h = new Chess(x.fenRival); h.move(s); return h.in_checkmate(); })()));
  if (otra) ok("y rechaza otra jugada (" + x.id + ")", !R.amenazaAcertada(Chess, x, otra).ok);
});

/* ---------- 3. Descarte ---------- */
titulo("Descarte");
const TOTAL_DESCARTE = { 1: 3, 2: 4, 3: 5, 4: 6 };
DATOS.descarte.forEach((x) => {
  ok("cantidad de candidatas del nivel (" + x.id + ")", x.candidatas.length === TOTAL_DESCARTE[x.nivel], "tiene " + x.candidatas.length);
  x.candidatas.forEach((c) => {
    ok("candidata legal: " + c.san + " (" + x.id + ")", !!new Chess(x.fen).move(c.san));
    ok("y su castellano (" + x.id + ")", R.sanEs(c.san) === c.sanEs);
  });
  const pierden = x.candidatas.filter((c) => c.pierde), aguantan = x.candidatas.filter((c) => !c.pierde);
  ok("hay de las que pierden y de las que aguantan (" + x.id + ")", pierden.length >= 1 && aguantan.length >= 1);
  const peorQueAguanta = Math.min.apply(null, aguantan.map((c) => c.eval));
  const mejorQueAguanta = Math.max.apply(null, aguantan.map((c) => c.eval));
  ok("las que aguantan están a menos de 0,6 entre sí (" + x.id + ")", mejorQueAguanta - peorQueAguanta <= 60);
  pierden.forEach((c) => {
    ok("la que pierde queda 2,5 peones abajo: " + c.san + " (" + x.id + ")", c.mateEn ? c.mateEn > 0 : c.eval <= mejorQueAguanta - 250, "eval " + c.eval + " contra " + mejorQueAguanta);
    ok("y trae su refutación (" + x.id + ")", !!c.refuta);
  });
  const r = R.corregirDescarte(x, pierden.map((c) => c.san));
  ok("tachar justo las que pierden es perfecto (" + x.id + ")", r.perfecto);
  ok("no tachar nada no lo es (" + x.id + ")", !R.corregirDescarte(x, []).perfecto);
});

/* ---------- Siete diferencias ---------- */
titulo("Siete diferencias");
const TIPO_DIF = { 1: ["quitar"], 2: ["peon"], 3: ["mover"], 4: ["quitar", "peon", "mover"] };
DATOS.diferencias.forEach((x) => {
  ok("A es legal (" + x.id + ")", !!legal(x.fenA), x.fenA);
  ok("A y B comparten turno, enroques y contadores (" + x.id + ")", x.fenA.split(" ").slice(1).join(" ") === x.fen.split(" ").slice(1).join(" "), x.fenA + " | " + x.fen);
  ok("el tipo de cambio es el de su nivel (" + x.id + ")", TIPO_DIF[x.nivel].includes(x.cambio.tipo), x.cambio.tipo);
  // las dos posiciones difieren EXACTAMENTE en las casillas del cambio
  const A = R.tablero(x.fenA), B = R.tablero(x.fen);
  const distintas = [];
  for (let i = 0; i < 64; i++) {
    const a = A[i] ? A[i].c + A[i].t : "", b = B[i] ? B[i].c + B[i].t : "";
    if (a !== b) distintas.push(R.sq(i));
  }
  ok("A y B difieren solo donde dice el cambio (" + x.id + ")", distintas.sort().join() === x.cambio.casillas.slice().sort().join(), distintas.join() + " contra " + x.cambio.casillas.join());
  const pa = A[R.idx(x.cambio.de)];
  ok("la pieza del cambio está en A donde dice (" + x.id + ")", pa && pa.c + pa.t === x.cambio.pieza);
  if (x.cambio.a) {
    const pb = B[R.idx(x.cambio.a)];
    ok("y en B donde dice (" + x.id + ")", pb && pb.c + pb.t === x.cambio.pieza && !B[R.idx(x.cambio.de)]);
  } else ok("en B falta (" + x.id + ")", !B[R.idx(x.cambio.de)]);
  ok("el texto nombra las casillas (" + x.id + ")", x.texto.includes(x.cambio.de) && (!x.cambio.a || x.texto.includes(x.cambio.a)), x.texto);
  const gA = new Chess(x.fenA), gB = new Chess(x.fen);
  ok("el golpe es legal en A (" + x.id + ")", !!gA.move(x.golpe));
  ok("y en B (" + x.id + ")", !!gB.move(x.golpe));
  ok("su castellano (" + x.id + ")", R.sanEs(x.golpe) === x.golpeEs);
  if (x.mateA === 1) ok("en A promete mate en 1 y es mate (" + x.id + ")", gA.in_checkmate());
  ok("en B el golpe no da mate (" + x.id + ")", !gB.in_checkmate());
  ok("en A gana: mate o 2 peones (" + x.id + ")", (x.mateA && x.mateA > 0) || x.evalA >= 200, x.evalA);
  ok("en B ya no: +0,8 o menos (" + x.id + ")", (x.mateB !== null && x.mateB < 0) || (x.mateB === null && x.evalB <= 80), x.evalB + " " + x.mateB);
  (x.salvan || []).forEach((san) => ok("la refutación es legal en B tras el golpe: " + san + " (" + x.id + ")", !!new Chess(gB.fen()).move(san)));
  ok("B no se repite con otra posición del banco (" + x.id + ")", DATOS.diferencias.filter((y) => y.fen === x.fen).length === 1);
});

/* ---------- 4. La balanza ---------- */
titulo("La balanza");
const CRITERIO = {
  1: (x) => Math.abs(x.material) >= 3 && Math.sign(x.material) === Math.sign(x.eval) && Math.abs(x.eval) >= 2.5,
  2: (x) => Math.abs(x.eval) <= 1.5 && Math.abs(x.material) <= 1,
  3: (x) => x.material === 0 && Math.abs(x.eval) >= 2,
  4: (x) => Math.abs(x.material) >= 2 && ((Math.sign(x.eval) === -Math.sign(x.material) && Math.abs(x.eval) >= 1) || Math.abs(x.eval) <= 0.7),
};
DATOS.balanza.forEach((x) => {
  ok("el material guardado es el de la posición (" + x.id + ")", material(x.fen) === x.material, "guardado " + x.material + ", da " + material(x.fen));
  ok("cumple el criterio de su nivel (" + x.id + ")", CRITERIO[x.nivel](x), "eval " + x.eval + ", material " + x.material);
  const g = legal(x.fen);
  ok("no es una partida terminada (" + x.id + ")", g && !g.game_over());
});
// la regla de la aguja
ok("clavarla da tres estrellas", R.puntosBalanza(1.5, 1.5).estrellas === 3);
ok("del lado equivocado no da estrellas", R.puntosBalanza(-1.5, 1.6).estrellas === 0);
ok("más allá de ±5 se recorta", R.puntosBalanza(5, 9.9).estrellas === 3);
ok("a 1,5 de distancia, dos", R.puntosBalanza(1, 2.5).estrellas === 2);

/* ---------- 5. Fotografía ---------- */
titulo("Fotografía");
const RANGOS = { 1: [3, 7], 2: [8, 12], 3: [13, 18], 4: [19, 26], 5: [16, 32] };
DATOS.fotografia.forEach((x) => {
  const n = R.tablero(x.fen).filter(Boolean).length;
  ok("la cantidad de piezas es la de la posición (" + x.id + ")", n === x.piezas, "dice " + x.piezas + ", hay " + n);
  ok("y cae en el rango del nivel (" + x.id + ")", n >= RANGOS[x.nivel][0] && n <= RANGOS[x.nivel][1]);
  ok("reconstruirla perfecta no tiene errores (" + x.id + ")", (() => {
    const col = {}; R.tablero(x.fen).forEach((p, i) => { if (p) col[R.sq(i)] = p.c + p.t; });
    return R.compararFoto(x.fen, col).errores === 0;
  })());
  if (x.nivel !== 5) return;
  ok("tres preguntas (" + x.id + ")", x.preguntas && x.preguntas.length === 3);
  (x.preguntas || []).forEach((q) => {
    ok("la respuesta está una sola vez entre las opciones (" + x.id + ")", q.opciones.filter((o) => o === q.correcta).length === 1, q.texto);
    ok("sin opciones repetidas (" + x.id + ")", new Set(q.opciones).size === q.opciones.length, q.opciones.join(","));
    const tab = R.tablero(x.fen);
    let m;
    if ((m = /^¿Qué había en ([a-h][1-8])\?$/.exec(q.texto))) {
      const p = tab[R.idx(m[1])];
      const esperado = p ? R.NOMBRE[p.t] : "nada";
      ok("¿qué había?: la respuesta es la pieza de esa casilla (" + x.id + ")", q.correcta.indexOf(esperado) === 0 && (!p || q.correcta.indexOf(p.c === "w" ? "blanc" : "negr") > 0), q.texto + " → " + q.correcta);
    } else if ((m = /^¿Dónde estaba el rey (blanco|negro)\?$/.exec(q.texto))) {
      const c = m[1] === "blanco" ? "w" : "b";
      ok("¿dónde estaba el rey?: es su casilla (" + x.id + ")", R.sq(tab.findIndex((p) => p && p.t === "k" && p.c === c)) === q.correcta);
    } else if ((m = /^¿Cuántos peones tenían las (blancas|negras)\?$/.exec(q.texto))) {
      const c = m[1] === "blancas" ? "w" : "b";
      ok("¿cuántos peones?: la cuenta (" + x.id + ")", String(tab.filter((p) => p && p.t === "p" && p.c === c).length) === q.correcta);
    } else ok("pregunta conocida (" + x.id + ")", false, q.texto);
  });
});
{
  const r = R.leerPiezas("Rg1 Tf1 a2 Dxd1 cb3", "w");
  ok("leerPiezas entiende «Rg1 Tf1 a2» y avisa lo que no entiende", r.piezas.g1 === "wk" && r.piezas.f1 === "wr" && r.piezas.a2 === "wp" && r.malas.length === 1 && r.piezas.b3 === "wn", JSON.stringify(r));
  const foto = R.compararFoto("4k3/8/8/8/8/8/8/4K2R w - - 0 1", { e1: "wk", h1: "wq", a1: "wp" });
  ok("compararFoto cuenta bien, falta, cambiada y sobra", foto.aciertos === 1 && foto.faltan.join() === "e8" && foto.cambiadas.join() === "h1" && foto.sobran.join() === "a1", JSON.stringify(foto));
}

/* ---------- 6. Con lo justo ---------- */
titulo("Con lo justo (recalcula las tablas de finales)");
const PIEZAS = { 1: "rr", 2: "q", 3: "r", 4: "bb", 5: "bn" };
const MAXIMOS = { q: 10, r: 16, rr: 7, bb: 19, bn: 33 };    // los de la teoría
Object.keys(MAXIMOS).forEach((p) => {
  const t = FinalesDTM.resolver(p);
  let mx = 0; for (const v of t.W) if (v > mx) mx = v;
  ok("la tabla de " + p + " da el mate más largo conocido (" + MAXIMOS[p] + ")", (mx + 1) / 2 === MAXIMOS[p], "da " + (mx + 1) / 2);
});
DATOS["con-lo-justo"].forEach((x) => {
  ok("las piezas son las del nivel (" + x.id + ")", x.piezas === PIEZAS[x.nivel]);
  ok("juegan las blancas (" + x.id + ")", x.fen.split(" ")[1] === "w");
  const d = FinalesDTM.resolver(x.piezas).dtm(x.fen);
  ok("el mínimo es el exacto (" + x.id + ")", d === x.minimo, "dice " + x.minimo + ", da " + d);
  // el rey negro no puede comerse nada de entrada
  const g = new Chess(x.fen.replace(" w ", " b "));
  ok("nada colgando al empezar (" + x.id + ")", !g.moves({ verbose: true }).some((m) => m.captured));
});
{
  // la defensa del rey: se come lo que está suelto
  const d = R.defensaRey(Chess, "8/8/8/8/8/3k4/3R4/7K b - - 0 1");
  ok("el rey negro se come la torre suelta", d && d.to === "d2", d && d.san);
  const d2 = R.defensaRey(Chess, "8/8/8/8/8/8/1k6/K7 b - - 0 1");
  ok("y siempre devuelve una jugada legal", d2 && new Chess("8/8/8/8/8/8/1k6/K7 b - - 0 1").move(d2.san));
}

/* =====================================================================
 * 8 a 14: se vuelve a correr la regla de js/tipos-reglas-mas.js sobre cada
 * ejercicio y tiene que dar exactamente lo que dice el banco.
 * ===================================================================== */
const M = require("../js/tipos-reglas-mas.js");
const KPK = require("./lib/kpk.js");

titulo("El Barrido");
const RANGO_BARRIDO = { 1: [0, 14], 2: [0, 22], 3: [0, 22], 4: [24, 32] };
DATOS.barrido.forEach((x) => {
  const r = M.barrido(Chess, x.fen);
  x.pide.forEach((c) => ok("«" + c + "» es la lista completa (" + x.id + ")", JSON.stringify(r[c].slice().sort()) === JSON.stringify(x.respuestas[c].slice().sort()), r[c].join() + " contra " + x.respuestas[c].join()));
  const np = R.tablero(x.fen).filter(Boolean).length;
  ok("piezas del nivel (" + x.id + ")", np >= RANGO_BARRIDO[x.nivel][0] && np <= RANGO_BARRIDO[x.nivel][1], np);
  ok("hay algo que encontrar (" + x.id + ")", x.pide.some((c) => x.respuestas[c].length));
  if (x.nivel >= 3) ok("pide amenazas y hay (" + x.id + ")", x.pide.includes("amenazas") && x.respuestas.amenazas.length > 0);
});
{
  // la definición, en tres casos hechos a mano: jaque que captura es jaque,
  // captura sin jaque es captura, y una amenaza es tranquila y nueva
  const r = M.barrido(Chess, "4k3/8/8/3p4/8/8/3R4/4K3 w - - 0 1");
  ok("barrido: Te2+ es jaque, Txd5 es captura", r.jaques.includes("Re2+") && r.capturas.includes("Rxd5") && !r.jaques.includes("Rxd5"), JSON.stringify(r));
  const a = M.barrido(Chess, "4k3/8/8/8/8/2n5/8/R3K3 w - - 0 1");
  ok("barrido: Ta3 amenaza el caballo suelto de c3", a.amenazas.includes("Ra3"), JSON.stringify(a));
  ok("barrido: Tb1 no amenaza nada", !a.amenazas.includes("Rb1"));
}

titulo("Intercambios");
DATOS.intercambios.forEach((x) => {
  const r = M.intercambio(Chess, x.fen, x.casilla);
  ok("el resultado es el que dice (" + x.id + ")", r && r.valor === x.valor, r && r.valor + " contra " + x.valor);
  ok("la línea que conviene (" + x.id + ")", r && JSON.stringify(r.jugadas) === JSON.stringify(x.jugadas));
  ok("sin coronaciones ni al paso (" + x.id + ")", r && !r.corona && !r.alPaso);
  const clase = r.clavada ? 4 : r.rayos ? 3 : r.pasos.length >= 4 ? 2 : 1;
  ok("el nivel es el de su tipo de cambio (" + x.id + ")", clase === x.nivel, "da " + clase);
  const buena = x.nivel <= 2 ? (x.valor > 0 ? "gana" : x.valor < 0 ? "pierde" : "igual") : String(x.valor);
  ok("la respuesta está una sola vez entre las opciones (" + x.id + ")", x.opciones.filter((o) => o === buena).length === 1, x.opciones.join());
  ok("sin opciones repetidas (" + x.id + ")", new Set(x.opciones).size === x.opciones.length);
});
{
  const r = M.intercambio(Chess, "4k3/4r3/3p4/4n3/8/5N2/8/4R1K1 w - - 0 1", "e5");
  ok("intercambio: Cxe5 dxe5 y se para (queda igual)", r.valor === 0 && r.jugadas.join() === "Nxe5,dxe5", JSON.stringify(r));
  const s = M.intercambio(Chess, "4k3/8/8/4p3/8/8/4Q3/4R1K1 w - - 0 1", "e5");
  ok("intercambio: un peón sin defensa se gana (+1)", s.rayos === false && s.valor === 1, JSON.stringify(s));
}

titulo("Constrúyela tú");
DATOS.construye.forEach((x) => {
  const sol = M.solucionesConstruye(Chess, x);
  ok("las casillas que sirven son las que dice (" + x.id + ")", JSON.stringify(sol) === JSON.stringify(x.soluciones), sol.join() + " contra " + x.soluciones.join());
  ok("hay al menos una (" + x.id + ")", sol.length >= 1);
  const OBJ = { 1: "mate-ya", 2: "horquilla", 3: "clavada", 4: "mate-en-1", 5: "quitar-mate" };
  ok("el objetivo es el del nivel (" + x.id + ")", OBJ[x.nivel] === x.objetivo);
  const g = new Chess(); ok("la base es legal (" + x.id + ")", g.load(x.fen));
  if (x.objetivo === "mate-en-1") ok("sin la pieza no hay mate en 1 (" + x.id + ")", !M.tieneMateEn1(new Chess(x.fen)));
  if (x.objetivo === "quitar-mate") ok("sin la pieza SÍ hay mate en 1 (" + x.id + ")", M.tieneMateEn1(new Chess(x.fen)));
  if (x.objetivo === "mate-ya") ok("sin la pieza no es mate (" + x.id + ")", !new Chess(x.fen).in_checkmate());
});

titulo("Rey y peón (recalcula la tabla entera)");
{
  const t = KPK.resolver();
  let w = 0, vw = 0, b = 0, vb = 0;
  for (let i = 0; i < t.W.length; i++) { if (t.validaW[i]) { vw++; if (t.W[i]) w++; } if (t.validaB[i]) { vb++; if (t.B[i]) b++; } }
  ok("blancas al mover: 124.960 ganadas de 163.328 (lo conocido de este final)", w === 124960 && vw === 163328, w + "/" + vw);
  ok("negras al mover: 97.604 ganadas de 168.024", b === 97604 && vb === 168024, b + "/" + vb);
  const bits = KPK.bits(t);
  const publicado = M.bitsDeBase64(JSON.parse(fs.readFileSync(path.join(RAIZ, "entreno/data/kpk.json"), "utf8")).bits);
  let distintos = 0;
  for (let i = 0; i < bits.length; i++) if (bits[i] !== publicado[i]) distintos++;
  ok("entreno/data/kpk.json es la tabla recalculada, byte por byte", distintos === 0 && bits.length === publicado.length, distintos + " bytes distintos");
  DATOS.peones.forEach((x) => {
    ok("gana o tablas, según la tabla (" + x.id + ")", M.kpkGana(publicado, x.fen) === x.gana);
    if (x.nivel >= 3) ok("juegan las blancas y ganan (" + x.id + ")", x.fen.split(" ")[1] === "w" && x.gana);
    if (x.nivel === 3) {
      const g = new Chess(x.fen);
      const ganan = g.moves({ verbose: true }).filter((m) => { g.move(m); const v = !m.promotion && M.kpkGana(publicado, g.fen()); g.undo(); return v; });
      ok("una sola jugada gana, y es la que dice (" + x.id + ")", ganan.length === 1 && ganan[0].san === x.jugada, ganan.map((m) => m.san).join());
    }
  });
  const cuenta = (n, v) => DATOS.peones.filter((x) => x.nivel === n && x.gana === v).length;
  ok("en los niveles 1 y 2 hay de las dos respuestas", [1, 2].every((n) => cuenta(n, true) >= 5 && cuenta(n, false) >= 5));
}

titulo("Adivina la jugada del maestro");
{
  const archivo = path.join(RAIZ, "cursos/protegido/data/tipos-maestro.json");
  const completo = JSON.parse(fs.readFileSync(archivo, "utf8")).maestro;
  const curso = JSON.parse(fs.readFileSync(path.join(RAIZ, "cursos/protegido/data/partidas-modelo.json"), "utf8")).partidas;
  // al banco público solo va el índice: nada de posiciones ni jugadas
  ok("el banco público del maestro trae solo ids y niveles", DATOS.maestro.every((x) => Object.keys(x).sort().join() === "id,nivel"));
  ok("el índice público es el del archivo protegido", JSON.stringify(DATOS.maestro) === JSON.stringify(completo.map((x) => ({ id: x.id, nivel: x.nivel }))));
  ok("el archivo del maestro está detrás del candado (cursos/protegido/)", /cursos\/protegido\//.test(archivo.replace(/\\/g, "/")));
  completo.forEach((x) => {
    const p = curso[x.partida];
    ok("la partida existe en el curso (" + x.id + ")", !!p);
    if (!p) return;
    x.posiciones.forEach((pos) => {
      // la posición y la jugada son las de la partida, tal cual
      const k = p.moves.findIndex((m, i) => (i === 0 ? p.start_fen : p.moves[i - 1].fen) === pos.fen && m.san === pos.jugada);
      ok("posición y jugada son las de la partida (" + x.id + " " + pos.n + ")", k >= 0);
      ok("la jugada es del bando que se juega (" + x.id + ")", pos.fen.split(" ")[1] === x.lado);
      ok("la respuesta del rival es la de la partida (" + x.id + " " + pos.n + ")", k >= 0 && (p.moves[k + 1] ? p.moves[k + 1].san : null) === pos.respuesta);
      pos.buenas.forEach((b) => ok("las buenas son legales y distintas de la del maestro (" + x.id + ")", b !== pos.jugada && !!new Chess(pos.fen).move(b)));
    });
  });
}

titulo("¿Qué apertura es?");
{
  const { LINEAS } = require("../js/aperturas-lineas.js");
  DATOS.apertura.forEach((x) => {
    const g = new Chess();
    const jugadas = x.orden || x.jugadas;
    ok("las jugadas son legales (" + x.id + ")", jugadas.every((j) => !!g.move(j)));
    ok("y llevan a la posición (" + x.id + ")", g.fen().split(" ").slice(0, 2).join(" ") === x.fen.split(" ").slice(0, 2).join(" "));
    ok("la respuesta está una sola vez entre las opciones (" + x.id + ")", x.opciones.filter((o) => o === x.correcta).length === 1);
    ok("sin opciones repetidas (" + x.id + ")", new Set(x.opciones).size === x.opciones.length);
    if (x.nivel === 3) {
      const h = new Chess();
      ok("en otro orden también son legales (" + x.id + ")", x.jugadas.every((j) => !!h.move(j)));
      ok("y llegan a lo mismo (" + x.id + ")", h.fen().split(" ").slice(0, 2).join(" ") === g.fen().split(" ").slice(0, 2).join(" "));
      ok("el orden es de verdad otro (" + x.id + ")", x.jugadas.join() !== x.orden.join());
    }
    if (x.nivel === 1) {
      // ninguna línea de otra apertura pasa por esta misma posición
      const otras = LINEAS.filter((l) => l.apertura !== x.correcta).filter((l) => {
        const h = new Chess(); return l.jugadas.slice(0, x.jugadas.length).every((j) => !!h.move(j)) && h.fen() === x.fen;
      });
      ok("la posición es solo de esa apertura (" + x.id + ")", !otras.length, otras.map((l) => l.id).join());
    }
  });
}

titulo("La ruta segura");
DATOS.ruta.forEach((x) => {
  const r = M.rutaMinima(x.fen, x.desde, x.hasta);
  ok("el mínimo es el que dice (" + x.id + ")", r && r.n === x.minimo, r && r.n);
  let actual = x.desde, bien = true;
  x.camino.forEach((s) => { if (!M.pasoValido(x.fen, x.desde, actual, s).ok) bien = false; actual = s; });
  ok("el camino de ejemplo es válido paso a paso (" + x.id + ")", bien && actual === x.hasta && x.camino.length === x.minimo);
});
{
  ok("ruta: la torre de a1 a h8 rodea a su propio rey", JSON.stringify(M.rutaMinima("4k3/8/8/8/8/8/8/R3K3 w - - 0 1", "a1", "h8")) === JSON.stringify({ n: 3, camino: ["a2", "h2", "h8"] }));
  ok("ruta: no se puede terminar en una casilla atacada", M.rutaMinima("4k3/8/8/8/8/8/8/R3K3 w - - 0 1", "a1", "d8") === null);
}

console.log("\n" + (fallos ? "✗ " + fallos + " de " + pruebas + " comprobaciones fallaron." : "✓ Las " + pruebas + " comprobaciones pasaron."));
process.exit(fallos ? 1 : 0);
