/* Las variantes de Desafíos: lo que se juega DESPUÉS de la primera jugada.
 *
 * Antes cada desafío terminaba en la primera jugada buena: «¿A qué casilla
 * llevas el alfil para capturar el peón?» se contestaba con Ac5 y ahí se
 * cortaba, sin ver nunca cómo el alfil se come el peón. Ahora el rival contesta
 * y el alumno sigue jugando hasta que la idea se cumple (el peón cae, la pieza
 * corona, se gana el material, el mate).
 *
 * Ninguna jugada se inventa: las saca este script con un buscador pequeño
 * (negamax con poda alfa-beta y búsqueda de capturas) sobre js/mini-chess.js,
 * el mismo motor sin reyes que usa la página, así que toda jugada es legal en
 * el tablero del alumno. La línea termina cuando lo que se ganó ya está en el
 * tablero y el buscador no ve nada más que cambie el material (ni a favor ni
 * en contra), o cuando el rival no puede mover (mate, ahogado o sin piezas).
 *
 * Escribe `solution.lineas` en entreno/data/desafios.json: por cada primera
 * jugada aceptada, la línea entera en formato origen-destino, empezando por
 * esa jugada (alumno, rival, alumno…). No se edita a mano.
 *
 *   node herramientas/desafios-variantes.js            escribe el JSON
 *   node herramientas/desafios-variantes.js --revisar  solo dice si está al día
 *   node herramientas/desafios-variantes.js --ver      imprime las líneas
 */
"use strict";

const fs = require("fs");
const path = require("path");
const MiniChess = require("../js/mini-chess.js");

const ARCHIVO = path.join(__dirname, "..", "entreno", "data", "desafios.json");
const PROFUNDIDAD = 6;      // medias jugadas de búsqueda completa (más las capturas)
const MAX_JUGADAS = 15;     // tope de medias jugadas (8 del alumno): si no llega, sin variante
const VALOR = { p: 100, n: 300, b: 300, r: 500, q: 900, k: 0 };
const MATE = 100000;

/* ---- El tablero, sin copiar en cada jugada ---- */
function estado(g) { return { board: Object.assign({}, g.board), side: g.side, castling: g.castling, ep: g.ep }; }
function volver(g, s) { g.board = s.board; g.side = s.side; g.castling = s.castling; g.ep = s.ep; }
/* Las jugadas legales. Sin rey propio no hay nada que dejar en jaque, así que
   alcanza con las de MiniChess.pseudoMoves (más las cuatro coronaciones), sin
   la copia del tablero que hace legalMoves por cada una: es lo mismo que
   devuelve legalMoves, cien veces más rápido. */
function jugadas(g) {
  let out = [];
  const sinRey = !g.kingSquare(g.side);
  for (const sq of Object.keys(g.board)) {
    if (g.board[sq].color !== g.side) continue;
    if (!sinRey) { out = out.concat(g.legalMoves(sq)); continue; }
    for (const m of g.pseudoMoves(sq)) {
      if (m.flags.includes("p")) for (const promotion of ["q", "r", "b", "n"]) out.push(Object.assign({}, m, { promotion }));
      else out.push(m);
    }
  }
  // Las capturas y las coronaciones primero: la poda corta más y, a igual
  // valor, el rival elige lo más natural (comer, avanzar el peón).
  const peso = (m) => (m.captured ? 10 * VALOR[m.captured] - VALOR[m.piece] / 10 : 0) + (m.promotion ? VALOR[m.promotion] : 0) + (m.piece === "p" ? 1 : 0);
  return out.sort((a, b) => peso(b) - peso(a));
}
function uci(m) { return m.from + m.to + (m.promotion || ""); }
function material(g, color) {
  let v = 0;
  for (const sq in g.board) { const p = g.board[sq]; v += (p.color === color ? 1 : -1) * VALOR[p.type]; }
  return v;
}
function enJaque(g) { return g.in_check(); }
function tieneRey(g) { return !!g.kingSquare(g.side); }

/* Valor para el que mueve. Sin jugadas: mate (con rey en jaque), tablas por
   ahogado (con rey) o, en una posición sin reyes, lo que diga el material. */
function quietud(g, alfa, beta, ply) {
  const lista = jugadas(g);
  if (!lista.length) return finSinJugadas(g, ply);
  // Puede quedarse quieto (no está obligado a comer) o seguir comiendo.
  let mejor = material(g, g.side);
  if (mejor >= beta) return mejor;
  if (mejor > alfa) alfa = mejor;
  for (const m of lista) {
    if (!m.captured && !m.promotion) continue;
    const s = estado(g); g.apply(m);
    const v = -quietud(g, -beta, -alfa, ply + 1);
    volver(g, s);
    if (v > mejor) mejor = v;
    if (v > alfa) alfa = v;
    if (alfa >= beta) break;
  }
  return mejor;
}
function finSinJugadas(g, ply) {
  if (enJaque(g)) return -MATE + ply;
  if (tieneRey(g)) return 0;
  return material(g, g.side);
}
/* Negamax con poda alfa-beta, sin trucos sobre el valor: una primera versión
   lo acercaba a cero en cada media jugada (para preferir lo más corto) y,
   mezclado con la poda, daba valores falsos (un «material igualado» donde las
   blancas iban siete peones arriba). Lo corto sale de otro lado: las jugadas
   van ordenadas con las capturas y las coronaciones primero, y a igual valor
   se queda la primera; el mate más corto, por `ply`. */
function negamax(g, prof, alfa, beta, ply) {
  const lista = jugadas(g);
  if (!lista.length) return finSinJugadas(g, ply);
  if (prof <= 0) return quietud(g, alfa, beta, ply);
  let mejor = -Infinity;
  for (const m of lista) {
    const s = estado(g); g.apply(m);
    const v = -negamax(g, prof - 1, -beta, -alfa, ply + 1);
    volver(g, s);
    if (v > mejor) mejor = v;
    if (v > alfa) alfa = v;
    if (alfa >= beta) break;
  }
  return mejor;
}
function mejorJugada(g, prof) {
  let mejor = null, valor = -Infinity;
  for (const m of jugadas(g)) {
    const s = estado(g); g.apply(m);
    // Ventana desde lo mejor hallado: a igual valor se queda la primera.
    const v = -negamax(g, prof - 1, -Infinity, -valor, 1);
    volver(g, s);
    if (v > valor) { valor = v; mejor = m; }
  }
  return { jugada: mejor, valor };
}

/* La línea a partir de la primera jugada del alumno. */
function linea(fen, primera) {
  const g = new MiniChess(fen);
  const alumno = g.side;
  const m0 = g.move({ from: primera.slice(0, 2), to: primera.slice(2, 4), promotion: primera[4] || "q" });
  if (!m0 || uci(m0) !== primera) throw new Error("la jugada " + primera + " no es legal en " + fen);
  const out = [primera];
  const inicio = material(new MiniChess(fen), alumno);
  let delAlumno = m0;   // la última jugada del alumno
  while (true) {
    if (!jugadas(g).length) break;
    // Le toca al rival. ¿La idea ya se cumplió?
    const { jugada, valor } = mejorJugada(g, PROFUNDIDAD);
    const visto = -valor, ya = material(g, alumno);
    if (process.env.DEPURAR) console.error(out.join(" "), { visto, ya, inicio });
    // Con un mate a la vista se sigue hasta darlo. Si no, se para en cuanto:
    //   · ya no hay nada que ganar (lo que ve el buscador es lo que hay), o
    //   · el alumno ya ganó material y el rival no lo recupera.
    // Una primera versión seguía mientras el buscador viera algo más que comer,
    // y la dama recién coronada se pasaba veinte jugadas cazando peones.
    // La excepción: si el rival vuelve a comer en la casilla de la última
    // jugada, se juega, porque la recaptura es parte de la idea («si la torre
    // come la dama, el otro peón corona»).
    const recaptura = jugada.captured && jugada.to === delAlumno.to;
    if (visto < MATE / 2 && !recaptura) {
      if (visto - ya < 50) break;
      if (ya - inicio >= 100 && visto >= ya - 50) break;
    }
    if (out.length + 2 > MAX_JUGADAS) return null;   // no llegó: se avisa
    g.apply(jugada); out.push(uci(jugada));
    if (!jugadas(g).length) break;
    const r = mejorJugada(g, PROFUNDIDAD);
    if (process.env.DEPURAR) console.error("  alumno", uci(r.jugada), r.valor);
    // Después de la recaptura del rival, si el alumno ya está ganando y no le
    // queda nada más que sacar, la variante termina ahí: si no, le tocaba una
    // jugada de relleno («axb4 axb4 Ad5»).
    const ahora = material(g, alumno);
    if (recaptura && r.valor < MATE / 2 && r.valor - ahora < 50 && ahora - inicio >= 100) break;
    g.apply(r.jugada); out.push(uci(r.jugada));
    delAlumno = r.jugada;
  }
  return out;
}

/* La línea en SAN, para mirarla. */
function enSan(fen, ucis) {
  const g = new MiniChess(fen);
  return ucis.map((u) => { const m = g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || "q" }); return m ? m.san : "¿" + u + "?"; }).join(" ");
}

/* Solo se guardan las variantes de más de una jugada: un desafío que se
   resuelve en una (un mate, una defensa) sigue igual que antes, y uno cuya
   variante no llega a cumplir la idea en ocho jugadas tampoco lleva (mejor sin
   variante que con una que no dice nada); --ver los lista. */
function generar(datos) {
  for (const ch of datos.challenges) {
    const lineas = {};
    for (const primera of ch.solution.moves) {
      const l = linea(ch.fen, primera);
      if (l && l.length > 1) lineas[primera] = l;
    }
    if (Object.keys(lineas).length) ch.solution.lineas = lineas;
    else delete ch.solution.lineas;
  }
  return datos;
}

if (require.main === module) {
  const texto = fs.readFileSync(ARCHIVO, "utf8");
  const datos = JSON.parse(texto);
  const args = process.argv.slice(2);
  const solo = args.filter((a) => /^\d+$/.test(a)).map(Number);
  if (args.includes("--ver")) {
    for (const ch of datos.challenges) {
      if (solo.length && !solo.includes(ch.n)) continue;
      const t = Date.now();
      for (const primera of ch.solution.moves) {
        const l = linea(ch.fen, primera);
        console.log(`#${ch.n} [${ch.cat}] ${l ? enSan(ch.fen, l) : primera + "  ✗ SIN VARIANTE (no cumple la idea en 8 jugadas)"}   (${Date.now() - t} ms)`);
      }
    }
    process.exit(0);
  }
  // Sin salto de línea al final y con LF, como está en el repositorio (en
  // Windows git lo deja con CRLF en la copia de trabajo: se compara sin eso).
  const nuevo = JSON.stringify(generar(JSON.parse(texto)), null, 1);
  if (args.includes("--revisar")) {
    if (nuevo !== texto.replace(/\r\n/g, "\n")) { console.error("✗ entreno/data/desafios.json no tiene las variantes al día: node herramientas/desafios-variantes.js"); process.exit(1); }
    console.log("✓ las variantes de Desafíos están al día");
    process.exit(0);
  }
  fs.writeFileSync(ARCHIVO, nuevo);
  console.log("✓ variantes escritas en entreno/data/desafios.json");
}

module.exports = { linea, enSan, mejorJugada, negamax };

/*! rev bfb5bbb0d2d82f9f */
