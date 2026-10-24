/* ===== El banco de la Racha táctica: de 1 a 8 jugadas, una sola buena en cada una =====
 *
 * La Racha táctica sube de jugadas con la racha (ver «La Racha táctica: una
 * racha que dura días» en docs/decisiones/entrenamiento.md): una jugada hasta
 * los 100 aciertos, dos hasta los 300, tres hasta los 600, cuatro hasta los
 * 1000… Este script arma los ejercicios de cada tramo a partir de la base
 * abierta de Lichess (CC0), que el profesor tiene en la tabla «Ejercicios
 * Lichess» de Supabase.
 *
 * Ninguno se cree a ciegas: en CADA jugada que le toca al alumno, Stockfish
 * tiene que estar de acuerdo en que es la única buena:
 *   - la jugada de la solución es la mejor del motor;
 *   - gana (mate, o al menos +2);
 *   - la segunda mejor NO gana: no da mate y no pasa de +1,5. Si dos jugadas
 *     ganan, el ejercicio tendría dos respuestas y la base corregiría como
 *     fallo una jugada buena.
 * Con una sola jugada legal, esa es la única (pasa). Los de «igualar»
 * (`equality`) no entran: la racha es para ganar.
 *
 * Cada ejercicio lleva su tema principal en español (TEMAS, en orden de
 * prioridad) para que la base vaya alternando temas y no tire diez mates
 * seguidos. En cada tramo, los mates no pasan del 40 %.
 *
 * Cómo se corre (Stockfish instalado: apt install stockfish; los candidatos se
 * leen de la tabla con la clave pública, que la tabla deja leer a cualquiera):
 *
 *   node herramientas/racha-banco-generar.js --n 3 --salida parte-3.json   (un tramo)
 *   node herramientas/racha-banco-generar.js --unir parte-*.json           (junta las partes)
 *   node herramientas/racha-banco-generar.js                               (todo seguido)
 *   … --candidatos lista.json   (sin red: los candidatos exportados de la tabla)
 *
 * Tarda: son unas 25 000 posiciones a profundidad 16. En el contenedor de
 * Claude Code la base no se alcanza por la red, así que lo corre
 * .github/workflows/racha-banco.yml (un trabajo por tramo, en paralelo).
 *
 * La salida es supabase/datos/racha-tactica-banco.json, que NO se edita a mano
 * y se carga en public.racha_ejercicios (ver la migración de la carga).
 * Cada fila: [id, jugadas, rating, tema, fen, movimientos UCI].
 */
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const { Chess } = require("chess.js");
const { Motor } = require("./lib/motor-uci");

const RAIZ = path.join(__dirname, "..");
const SALIDA = path.join(RAIZ, "supabase/datos/racha-tactica-banco.json");
const PROFUNDIDAD = 16;
const MOTORES = Math.max(1, Math.min(4, os.cpus().length));

/* Cuántos se quieren por tramo, y con qué filtro de calidad se piden. Los
   largos son pocos en la base: se baja el listón para tener de dónde sacar. */
const TRAMOS = {
  1: { meta: 1500, pop: 80, jugadas: 300, desv: 90, pedir: 9000 },
  2: { meta: 1500, pop: 85, jugadas: 1000, desv: 80, pedir: 5000 },
  3: { meta: 1200, pop: 85, jugadas: 1000, desv: 80, pedir: 5000 },
  4: { meta: 1000, pop: 80, jugadas: 500, desv: 85, pedir: 6000 },
  5: { meta: 600, pop: 70, jugadas: 200, desv: 90, pedir: 5000 },
  6: { meta: 300, pop: 60, jugadas: 100, desv: 100, pedir: 3000 },
  7: { meta: 150, pop: 50, jugadas: 50, desv: 120, pedir: 1500 },
  8: { meta: 80, pop: 40, jugadas: 30, desv: 150, pedir: 800 },
};
const TOPE_MATES = 0.4;

/* El tema principal: el primero de esta lista que traiga el ejercicio. */
const TEMAS = [
  ["smotheredMate", "Mate de la coz"], ["backRankMate", "Mate en la última fila"],
  ["mateIn1", "Mate"], ["mateIn2", "Mate"], ["mateIn3", "Mate"], ["mateIn4", "Mate"], ["mateIn5", "Mate"], ["mate", "Mate"],
  ["doubleCheck", "Jaque doble"], ["discoveredCheck", "Jaque a la descubierta"],
  ["fork", "Tenedor"], ["pin", "Clavada"], ["skewer", "Enfilada"], ["xRayAttack", "Rayos X"],
  ["discoveredAttack", "Ataque a la descubierta"], ["trappedPiece", "Pieza atrapada"],
  ["capturingDefender", "Eliminar al defensor"], ["deflection", "Desviación"], ["attraction", "Atracción"],
  ["interference", "Interferencia"], ["clearance", "Despeje"], ["intermezzo", "Jugada intermedia"],
  ["sacrifice", "Sacrificio"], ["quietMove", "Jugada tranquila"], ["zugzwang", "Zugzwang"],
  ["promotion", "Coronación"], ["advancedPawn", "Peón pasado"], ["hangingPiece", "Pieza colgada"],
  ["defensiveMove", "Jugada defensiva"], ["exposedKing", "Rey expuesto"],
  ["kingsideAttack", "Ataque al rey"], ["queensideAttack", "Ataque al rey"], ["attackingF2F7", "Ataque al rey"],
  ["pawnEndgame", "Final"], ["rookEndgame", "Final"], ["bishopEndgame", "Final"], ["knightEndgame", "Final"],
  ["queenEndgame", "Final"], ["queenRookEndgame", "Final"], ["endgame", "Final"],
];
function temaPrincipal(temas) {
  const t = String(temas || "").split(" ");
  const e = TEMAS.find(([k]) => t.includes(k));
  return e ? e[1] : "Táctica";
}

function argumento(nombre) {
  const i = process.argv.indexOf("--" + nombre);
  return i >= 0 ? process.argv[i + 1] : null;
}

/* ---------- Los candidatos, de la tabla «Ejercicios Lichess» ---------- */
function clavePublica() {
  const s = fs.readFileSync(path.join(RAIZ, "js/supabase-client.js"), "utf8");
  return {
    url: /SUPABASE_URL\s*=\s*"([^"]+)"/.exec(s)[1],
    clave: /SUPABASE_ANON_KEY\s*=\s*\n?\s*"([^"]+)"/.exec(s)[1],
  };
}
async function pedirCandidatos(n) {
  // --candidatos archivo.json: la misma lista exportada a mano ([{PuzzleId, FEN, Moves, Rating, Themes}, …]).
  if (argumento("candidatos")) return aCandidatos(JSON.parse(fs.readFileSync(argumento("candidatos"), "utf8"))
    .filter((f) => f.Moves.split(" ").length === 2 * n));
  const { url, clave } = clavePublica();
  const t = TRAMOS[n];
  // Exactamente 2n jugadas (la del rival y la del alumno, n veces): 2n−1 espacios y no 2n.
  const con = Array(2 * n).fill("*").join(" ");
  const sin = Array(2 * n + 1).fill("*").join(" ");
  const filas = [];
  for (let desde = 0; desde < t.pedir; desde += 1000) {
    const q = new URLSearchParams();
    q.set("select", "PuzzleId,FEN,Moves,Rating,Themes");
    q.append("Popularity", "gte." + t.pop);
    q.append("NbPlays", "gte." + t.jugadas);
    q.append("RatingDeviation", "lte." + t.desv);
    q.append("Moves", "like." + con);
    q.append("Moves", "not.like." + sin);
    q.append("Themes", "not.like.*equality*");
    q.set("order", "PuzzleId");
    const r = await fetch(url + "/rest/v1/" + encodeURIComponent("Ejercicios Lichess") + "?" + q.toString(), {
      headers: { apikey: clave, Authorization: "Bearer " + clave, Range: desde + "-" + (desde + 999), "Range-Unit": "items" },
    });
    if (!r.ok) throw new Error("La base contestó " + r.status + ": " + (await r.text()).slice(0, 300));
    const lote = await r.json();
    filas.push(...lote);
    if (lote.length < 1000) break;
  }
  return aCandidatos(filas);
}
function aCandidatos(filas) {
  return filas.map((f) => ({ id: f.PuzzleId, fen: f.FEN, moves: f.Moves.split(" "), rating: Number(f.Rating), temas: f.Themes }));
}

/* Un orden que reparte: se va tomando de a uno de cada franja de 100 de rating
   y, dentro de la franja, del tema que menos se tomó. Así, si el motor descarta
   muchos, el banco igual queda parejo de fácil a difícil y de temas. */
function ordenParejo(cands) {
  const franjas = new Map();
  cands.forEach((c) => {
    c.tema = temaPrincipal(c.temas);
    const k = Math.floor(c.rating / 100);
    if (!franjas.has(k)) franjas.set(k, []);
    franjas.get(k).push(c);
  });
  const listas = [...franjas.keys()].sort((a, b) => a - b).map((k) => franjas.get(k));
  const usados = {};
  const orden = [];
  let quedan = true;
  while (quedan) {
    quedan = false;
    listas.forEach((l) => {
      if (!l.length) return;
      quedan = true;
      let mejor = 0;
      l.forEach((c, i) => { if ((usados[c.tema] || 0) < (usados[l[mejor].tema] || 0)) mejor = i; });
      const [c] = l.splice(mejor, 1);
      usados[c.tema] = (usados[c.tema] || 0) + 1;
      orden.push(c);
    });
  }
  return orden;
}

/* ---------- Una sola buena en cada jugada del alumno ---------- */
function mov(uci) { return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }; }
function mismaJugada(a, b) { return a.slice(0, 4) === b.slice(0, 4) && (a[4] || "") === (b[4] || ""); }
const GANA_CP = 200, SEGUNDA_CP = 150;

async function comprobar(motor, c) {
  const g = new Chess(c.fen);
  for (let i = 0; i < c.moves.length; i++) {
    const uci = c.moves[i];
    if (i % 2 === 1) {   // le toca al alumno
      const legales = g.moves().length;
      if (legales > 1) {
        const top = await motor.analizar(g.fen(), 2, PROFUNDIDAD);
        if (!top.length || !mismaJugada(top[0].uci, uci)) return "el motor prefiere otra";
        const v = top[0];
        if (!(v.mate > 0 || v.score >= GANA_CP)) return "la solución no gana";
        const s = top[1];
        if (s && (s.mate > 0 || s.score > SEGUNDA_CP)) return "hay otra que gana";
      }
    }
    if (!g.move(mov(uci))) return "jugada ilegal";
  }
  return null;
}

async function tramo(n) {
  const t = TRAMOS[n];
  const cands = ordenParejo(await pedirCandidatos(n));
  console.log("Tramo " + n + ": " + cands.length + " candidatos, se buscan " + t.meta);
  const motores = Array.from({ length: MOTORES }, () => new Motor());
  const elegidos = [];
  const rechazos = {};
  let mates = 0, i = 0;
  const topeMates = Math.floor(t.meta * TOPE_MATES);
  async function trabajar(motor) {
    while (elegidos.length < t.meta && i < cands.length) {
      const c = cands[i++];
      const esMate = /Mate/.test(c.tema);
      if (esMate && mates >= topeMates) continue;
      const no = await comprobar(motor, c);
      if (no) { rechazos[no] = (rechazos[no] || 0) + 1; continue; }
      if (elegidos.length >= t.meta || (esMate && mates >= topeMates)) continue;
      if (esMate) mates++;
      elegidos.push([c.id, n, c.rating, c.tema, c.fen, c.moves.join(" ")]);
      if (elegidos.length % 100 === 0) console.log("  " + elegidos.length + " de " + t.meta + " (" + i + " mirados)");
    }
  }
  await Promise.all(motores.map(trabajar));
  motores.forEach((m) => m.cerrar());
  console.log("Tramo " + n + ": " + elegidos.length + " elegidos de " + i + " mirados. Descartados:", rechazos);
  return elegidos;
}

function escribir(filas) {
  filas.sort((a, b) => a[1] - b[1] || a[2] - b[2] || (a[0] < b[0] ? -1 : 1));
  const porTramo = {};
  filas.forEach((f) => { porTramo[f[1]] = (porTramo[f[1]] || 0) + 1; });
  const datos = {
    comentario: "Lo genera herramientas/racha-banco-generar.js: no se edita a mano. Cada fila: [id de Lichess, jugadas del alumno, rating, tema, FEN, movimientos UCI (el primero es del rival)].",
    criterio: { profundidad: PROFUNDIDAD, gana_cp: GANA_CP, segunda_cp: SEGUNDA_CP },
    por_tramo: porTramo,
    ejercicios: filas,
  };
  fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
  fs.writeFileSync(SALIDA, "{\n" + Object.keys(datos).map((k) => k === "ejercicios"
    ? '"ejercicios": [\n' + filas.map((f) => JSON.stringify(f)).join(",\n") + "\n]"
    : JSON.stringify(k) + ": " + JSON.stringify(datos[k])).join(",\n") + "\n}\n");
  console.log("Escrito " + path.relative(RAIZ, SALIDA) + ":", porTramo);
}

async function main() {
  const unir = process.argv.indexOf("--unir");
  if (unir >= 0) {
    const filas = process.argv.slice(unir + 1).flatMap((f) => JSON.parse(fs.readFileSync(f, "utf8")));
    escribir(filas);
    return;
  }
  const n = argumento("n");
  if (n) {
    const filas = await tramo(Number(n));
    fs.writeFileSync(argumento("salida") || ("parte-" + n + ".json"), JSON.stringify(filas));
    return;
  }
  let filas = [];
  for (const k of Object.keys(TRAMOS)) filas = filas.concat(await tramo(Number(k)));
  escribir(filas);
}
main().catch((e) => { console.error(e); process.exit(1); });
