/* ===== Las posiciones de «Cambiar o no cambiar» (curso y libro) =====
 *
 * Arma, desde los datos escritos a mano, las posiciones del curso y del libro
 * «Cambiar o no cambiar», de Oscar Angulo Cubero:
 *
 *   - material/cambiar-o-no-cambiar/banco.js: el banco del libro (las 33
 *     partidas modelo, el ejemplo de cada lección y los 22 ejercicios, con sus
 *     soluciones y lo que dice el motor). No se edita a mano.
 *   - el campo `diagramas` de cada lección de
 *     herramientas/cursos/cambiar-o-no-cambiar.json: los ejemplos (y en el
 *     bloque de ejercicios, los ejercicios) de la lección, los MISMOS del
 *     libro. Se reescribe en cada corrida; el resto del archivo es a mano.
 *
 * De dónde sale cada cosa:
 *
 *   - herramientas/datos/cambiar-o-no-cambiar-partidas.json: las partidas
 *     modelo que estudia el libro «El cambio de piezas» del MI Diego Valerga
 *     (2005), pasadas de su texto escaneado y comprobadas jugada por jugada.
 *     Las jugadas de una partida son hechos; los comentarios de ese libro no
 *     se copian: el texto del curso es propio.
 *   - herramientas/datos/cambiar-o-no-cambiar-ejercicios.json: los 22
 *     ejercicios del mismo libro, leídos de sus diagramas, con la línea de la
 *     partida. Que la línea se juegue entera desde la FEN es lo que confirma
 *     que el diagrama se leyó bien.
 *   - Cada lección dice qué momento de qué partida usa (`ejemplos`: partida,
 *     ply y cuántas medias jugadas mostrar); el bloque de ejercicios dice qué
 *     ejercicios lleva (`ejercicios`).
 *
 * Ninguna posición se cree a ciegas: además de chess.js, cada una pasa por
 * Stockfish, y lo que dice el motor sale escrito en el libro y en el curso,
 * también cuando no le da la razón a la jugada de la partida. Son posiciones
 * de estrategia: no prometen un resultado (en el curso van con «*»).
 *
 * Cómo se corre (hace falta Stockfish: apt install stockfish, o el binario
 * oficial con STOCKFISH=/ruta):
 *
 *   STOCKFISH=/usr/games/stockfish node herramientas/cambiar-o-no-cambiar-generar.js
 *
 * El análisis queda en herramientas/.cache-cambiar-o-no-cambiar.json (fuera
 * del repositorio) para no repetirlo. Después: curso-posiciones.js,
 * curso-generar.py, curso-material-generar.js, curso-material-enlazar.js y
 * cambiar-o-no-cambiar-pdf.js (ver «El curso y el libro "Cambiar o no
 * cambiar"» en docs/decisiones/cursos-y-material.md).
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { Chess } = require("chess.js");

const RAIZ = path.join(__dirname, "..");
const PARTIDAS = path.join(__dirname, "datos", "cambiar-o-no-cambiar-partidas.json");
const EJERCICIOS = path.join(__dirname, "datos", "cambiar-o-no-cambiar-ejercicios.json");
const CURSO = path.join(__dirname, "cursos", "cambiar-o-no-cambiar.json");
const CACHE = path.join(__dirname, ".cache-cambiar-o-no-cambiar.json");
const SALIDA = path.join(RAIZ, "material", "cambiar-o-no-cambiar", "banco.js");
const PROFUNDIDAD = 22;
const VERSION_MOTOR = "Stockfish 17";

const ES = { K: "R", Q: "D", R: "T", B: "A", N: "C" };
const sanEs = (san) => san.replace(/^([KQRBN])/, (m, p) => ES[p]).replace(/=([QRBN])/, (m, p) => "=" + ES[p]);

/* La línea numerada en español, desde la FEN: «15.Ac5 Tfe8 16.Tf2» o
   «12…Ae5 13.Axe5». */
function numerada(fen, sans) {
  let n = parseInt(fen.split(" ")[5], 10), turno = fen.split(" ")[1], s = "";
  sans.forEach((san, i) => {
    if (turno === "w") s += (s ? " " : "") + n + "." + sanEs(san);
    else s += (s ? " " : "") + (i === 0 ? n + "…" : "") + sanEs(san);
    if (turno === "b") n++;
    turno = turno === "w" ? "b" : "w";
  });
  return s;
}

/* Juega `sans` desde `fen` y devuelve las jugadas en SAN normalizado; si una
   no es legal, corta con un error que dice cuál. */
function jugar(fen, sans, quien) {
  const g = new Chess();
  if (!g.load(fen)) throw new Error(`${quien}: la FEN no carga (${fen})`);
  const partes = fen.split(" ");
  partes[1] = partes[1] === "w" ? "b" : "w";
  const otro = new Chess();
  if (otro.load(partes.join(" ")) && otro.in_check()) throw new Error(`${quien}: el bando que no mueve está en jaque`);
  return sans.map((san, i) => {
    const m = g.move(san, { sloppy: true });
    if (!m) throw new Error(`${quien}: la jugada ${i + 1} (${san}) no es legal en ${g.fen()}`);
    return { san: m.san, uci: m.from + m.to + (m.promotion || ""), fen: g.fen() };
  });
}

/* La evaluación, siempre desde las blancas y en peones: «+0,4», «−1,2». */
function valor(cp, turno) {
  const v = turno === "w" ? cp : -cp;
  if (Math.abs(v) >= 90000) return (v > 0 ? "mate de las blancas" : "mate de las negras");
  const r = Math.round(v / 10) / 10;
  const p = Math.abs(r).toFixed(1).replace(".", ",");
  return r > 0 ? "+" + p : r < 0 ? "−" + p : "0,0";
}

/* Lo que dice el motor de la jugada de la partida, en una frase. */
function opinion(an, fen, primeraSan) {
  const turno = fen.split(" ")[1];
  const top = an.top[0];
  const g = new Chess(fen);
  const mejor = g.move({ from: top.uci.slice(0, 2), to: top.uci.slice(2, 4), promotion: top.uci[4] });
  const dif = top.cp - an.libro;
  const jug = sanEs(primeraSan);
  let frase;
  if (top.uci === an.libroUci || dif <= 10) frase = `${jug} es la que elige el motor (${valor(an.libro, turno)})`;
  else if (dif <= 40) frase = `${jug} está entre las mejores (${valor(an.libro, turno)}; el motor prefiere apenas ${sanEs(mejor.san)}, ${valor(top.cp, turno)})`;
  else frase = `el motor prefiere ${sanEs(mejor.san)} (${valor(top.cp, turno)}) a ${jug} (${valor(an.libro, turno)})`;
  const otras = Object.entries(an.comparar || {}).map(([san, cp]) => `${sanEs(san)} da ${valor(cp, turno)}`);
  return `${VERSION_MOTOR} a profundidad ${PROFUNDIDAD}: ${frase}${otras.length ? "; " + otras.join(", ") : ""}.`;
}

async function analizarTodo(pedidos) {
  const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};
  const faltan = pedidos.filter((p) => !cache[p.clave]);
  if (faltan.length) {
    const { Motor } = require("./lib/motor-uci");
    const motor = new Motor();
    for (const p of faltan) {
      const top = await motor.analizar(p.fen, 3, PROFUNDIDAD);
      const libro = (await motor.analizar(p.fen, 1, PROFUNDIDAD, [p.uci]))[0];
      const comparar = {};
      for (const c of p.comparar || []) {
        const m = new Chess(p.fen).move(c, { sloppy: true });
        comparar[c] = (await motor.analizar(p.fen, 1, PROFUNDIDAD, [m.from + m.to + (m.promotion || "")]))[0].score;
      }
      cache[p.clave] = { top: top.map((t) => ({ uci: t.uci, cp: t.score })), libro: libro.score, libroUci: p.uci, comparar };
      fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1));
      process.stdout.write(".");
    }
    motor.p.kill();
    console.log("");
  }
  return cache;
}

async function main() {
  const partidas = JSON.parse(fs.readFileSync(PARTIDAS, "utf8")).partidas;
  const ejercicios = JSON.parse(fs.readFileSync(EJERCICIOS, "utf8")).ejercicios;
  const curso = JSON.parse(fs.readFileSync(CURSO, "utf8"));

  /* Las partidas, enteras: si una jugada no es legal, no se escribe nada. */
  const porId = {};
  for (const p of partidas) {
    const fen0 = p.fen_inicial || new Chess().fen();
    p.expandida = jugar(fen0, p.jugadas, `partida ${p.id}`);
    p.fen0 = fen0;
    porId[p.id] = p;
  }

  /* Los ejemplos de cada lección y los ejercicios de cada lección. */
  const ejemplos = [];
  const pedidos = [];
  let n = 0;
  curso.bloques.forEach((b) => b.lecciones.forEach((l) => {
    n += 1;
    (l.ejemplos || []).forEach((e, i) => {
      const p = porId[e.partida];
      if (!p) throw new Error(`lección ${n}: no existe la partida ${e.partida}`);
      if (e.ply >= p.jugadas.length) throw new Error(`lección ${n}: la partida ${e.partida} no llega al ply ${e.ply}`);
      const fen = e.ply === 0 ? p.fen0 : p.expandida[e.ply - 1].fen;
      const linea = p.jugadas.slice(e.ply, e.ply + e.plies);
      const exp = jugar(fen, linea, `lección ${n}`);
      const id = `CC-${n}${l.ejemplos.length > 1 ? "abc"[i] : ""}`;
      ejemplos.push({ id, leccion: n, partida: p.id, ply: e.ply, fen, juegan: fen.split(" ")[1],
        linea, primera: exp[0].san, pregunta: e.pregunta, comentario: e.comentario });
      pedidos.push({ clave: `${fen}|${exp[0].uci}`, fen, uci: exp[0].uci });
    });
  }));
  ejercicios.forEach((e) => {
    const exp = jugar(e.fen, e.linea.split(" "), `ejercicio ${e.n}`);
    e.primeraSan = exp[0].san;
    e.lineaSan = exp.map((x) => x.san);
    if (e.partida_siguio) jugar(e.fen, e.partida_siguio.split(" "), `ejercicio ${e.n} (lo que siguió en la partida)`);
    (e.comparar || []).forEach((c) => jugar(e.fen, [c], `ejercicio ${e.n} (comparar ${c})`));
    pedidos.push({ clave: `${e.fen}|${exp[0].uci}|${(e.comparar || []).join(",")}`, fen: e.fen, uci: exp[0].uci, comparar: e.comparar });
  });

  const cache = await analizarTodo(pedidos);
  ejemplos.forEach((e) => {
    const m = new Chess(e.fen).move(e.primera);
    e.comprobado = opinion(cache[`${e.fen}|${m.from + m.to + (m.promotion || "")}`], e.fen, e.primera);
  });
  ejercicios.forEach((e) => {
    const m = new Chess(e.fen).move(e.primeraSan);
    e.comprobado = opinion(cache[`${e.fen}|${m.from + m.to + (m.promotion || "")}|${(e.comparar || []).join(",")}`], e.fen, e.primeraSan);
  });

  /* El curso: un diagrama por ejemplo y, en el bloque de ejercicios, uno por
     ejercicio. Las posiciones son las mismas del libro. */
  const cabecera = (p) => `${p.blancas} – ${p.negras}, ${p.lugar} ${p.anio}`;
  n = 0;
  curso.bloques.forEach((b) => b.lecciones.forEach((l) => {
    n += 1;
    const diagramas = [];
    ejemplos.filter((e) => e.leccion === n).forEach((e) => {
      diagramas.push({ id: e.id, fen: e.fen, turno: e.juegan, resultado: "*",
        pregunta: `${cabecera(porId[e.partida])}. ${e.pregunta}`,
        comentario: `${e.comentario} (${e.comprobado})`, linea: e.linea });
    });
    (l.ejercicios || []).forEach((k) => {
      const e = ejercicios.find((x) => x.n === k);
      if (!e) throw new Error(`lección ${n}: no existe el ejercicio ${k}`);
      diagramas.push({ id: `CC-E${k}`, fen: e.fen, turno: e.fen.split(" ")[1], resultado: "*",
        pregunta: `Ejercicio ${k}. ${e.blancas} – ${e.negras}, ${e.lugar} ${e.anio}. ${e.pregunta}`,
        comentario: `${e.explica} (${e.comprobado})`, linea: e.lineaSan });
    });
    if (diagramas.length) l.diagramas = diagramas; else delete l.diagramas;
  }));
  fs.writeFileSync(CURSO, JSON.stringify(curso, null, 2) + "\n");

  /* El banco del libro. */
  const js = (v) => JSON.stringify(v);
  const salida = `/* ===== Las posiciones de «Cambiar o no cambiar», de Oscar Angulo Cubero =====
 *
 * GENERADO por herramientas/cambiar-o-no-cambiar-generar.js — no se edita a mano.
 *
 * ${partidas.length} partidas modelo, ${ejemplos.length} ejemplos de lección (los mismos del curso) y
 * ${ejercicios.length} ejercicios, de las partidas y los ejercicios que estudia el libro «El cambio
 * de piezas» del MI Diego Valerga (2005), comprobados con chess.js y con
 * ${VERSION_MOTOR}. Lo usa el libro (herramientas/cambiar-o-no-cambiar-pdf.js). Vive
 * detrás del candado de material/: trae las soluciones.
 */
window.CAMBIAR_O_NO_CAMBIAR = {
  TITULO: 'Cambiar o no cambiar',
  AUTOR: 'Oscar Angulo Cubero',
  FUENTE: 'El cambio de piezas. Transformaciones en la estrategia de la partida, MI Diego Valerga (Álvarez Castillo Editor, Buenos Aires, 2005)',
  MOTOR: ${js(`${VERSION_MOTOR} a profundidad ${PROFUNDIDAD}`)},
};
window.CAMBIAR_O_NO_CAMBIAR_PARTIDAS = [
${partidas.map((p) => `  ${js({ id: p.id, capitulo: p.capitulo, seccion: p.seccion, blancas: p.blancas, negras: p.negras, lugar: p.lugar, anio: p.anio, resultado: p.resultado, fen: p.fen0, desde: p.fen_inicial ? "diagrama" : "inicio", completa: p.completa, nota: p.nota || "", jugadas: numerada(p.fen0, p.expandida.map((x) => x.san)) })},`).join("\n")}
];
window.CAMBIAR_O_NO_CAMBIAR_EJEMPLOS = [
${ejemplos.map((e) => `  ${js({ id: e.id, leccion: e.leccion, partida: e.partida, ply: e.ply, fen: e.fen, juegan: e.juegan, primera: sanEs(e.primera), linea: numerada(e.fen, e.linea), pregunta: e.pregunta, comentario: e.comentario, comprobado: e.comprobado })},`).join("\n")}
];
window.CAMBIAR_O_NO_CAMBIAR_EJERCICIOS = [
${ejercicios.map((e) => `  ${js({ n: e.n, blancas: e.blancas, negras: e.negras, lugar: e.lugar, anio: e.anio, resultado: e.resultado, fen: e.fen, juegan: e.fen.split(" ")[1], primera: sanEs(e.primeraSan), linea: numerada(e.fen, e.lineaSan), siguio: e.partida_siguio ? numerada(e.fen, jugar(e.fen, e.partida_siguio.split(" "), "").map((x) => x.san)) : "", pregunta: e.pregunta, pista: e.pista, explica: e.explica, comprobado: e.comprobado })},`).join("\n")}
];
`;
  fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
  fs.writeFileSync(SALIDA, salida);
  console.log(`${partidas.length} partidas · ${ejemplos.length} ejemplos · ${ejercicios.length} ejercicios → ${path.relative(RAIZ, SALIDA)}`);
}

if (require.main === module) main().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
module.exports = { numerada, sanEs };
