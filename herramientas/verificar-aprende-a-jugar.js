#!/usr/bin/env node
/* Verifica las lecciones de Aprende a jugar (entreno/aprende-a-jugar.html).

   Las posiciones son las de lichess.org/learn, pero «vienen de Lichess» no es
   una comprobación. Este verificador juega cada nivel con el MISMO motor que
   usa la página (js/aprende-a-jugar-motor.js) y exige:

   1. que se pueda ganar con tres estrellas: busca (en anchura, sin repetir
      posiciones) una serie de jugadas que lo complete en las `jugadas` que
      pide, y comprueba que los puntos dan tres estrellas;
   2. que una posición con los dos reyes sea legal para chess.js (el rey del
      que no mueve no está en jaque) y que MiniChess y chess.js den las mismas
      jugadas en ella;
   3. que cada jugada del guion sea legal cuando le toca;
   4. que cada nivel tenga su meta escrita y que las flechas nombren casillas;
   5. que los números de la página digan la verdad (cuántas etapas y niveles).

   Sin navegador:  node herramientas/verificar-aprende-a-jugar.js */
"use strict";
const fs = require("fs");
const path = require("path");
const RAIZ = path.join(__dirname, "..");
const MiniChess = require("../js/mini-chess.js");
const M = require("../js/aprende-a-jugar-motor.js");
const { ETAPAS, CATEGORIAS } = require("../js/aprende-a-jugar-etapas.js");
const { Chess } = require("chess.js");

let fallos = 0;
const mal = (m) => { fallos++; console.log("  ✗ " + m); };
const CASILLA = /^[a-h][1-8]$/;

function jugadasDelAlumno(n) {
  const out = [];
  const g = n.juego;
  Object.keys(g.board).forEach((sq) => {
    n.destinos(sq).forEach((m) => {
      const promo = g.get(sq).type === "p" && (m.to[1] === "8" || m.to[1] === "1");
      (promo ? ["q", "n", "r", "b"] : [undefined]).forEach((p) => out.push({ from: sq, to: m.to, promotion: p }));
    });
  });
  return out;
}

/* Desde la posición inicial, buscar todas las series de cinco o seis jugadas
   no termina nunca: ahí se comprueba una línea escrita a mano, jugada con el
   mismo motor. */
const LINEAS = {
  "enroque:4": "g1f3 e2e3 f1e2 e1g1",
  "enroque:5": "b1c3 d2d3 c1e3 d1d2 e1c1",
};
function jugarLinea(plano, linea) {
  const n = new M.Nivel(plano);
  if (n.empiezaElRival()) n.rivalJuega();
  for (const u of linea.split(" ")) {
    const r = n.jugar({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    if (r.estado === "nada" || r.estado === "fallo") return null;
    if (r.guion && !n.guionCompleto()) n.rivalJuega();
  }
  return n.completo ? { nivel: n, linea: linea.split(" ") } : null;
}

/* La serie más corta que gana el nivel, o null si no hay ninguna en `tope`. */
function resolver(plano, tope) {
  const inicio = new M.Nivel(plano);
  if (inicio.empiezaElRival()) inicio.rivalJuega();
  const clave = (n) => n.juego.fen() + "|" + [...n.estrellas].sort().join(",") + "|" + n.paso;
  let capa = [{ n: inicio, linea: [] }];
  const vistos = new Set([clave(inicio)]);
  for (let prof = 1; prof <= tope; prof++) {
    const sig = [];
    for (const { n, linea } of capa) {
      for (const j of jugadasDelAlumno(n)) {
        const c = n.clonar();
        const r = c.jugar(j);
        if (r.estado === "nada" || r.estado === "fallo") continue;
        const l = linea.concat(j.from + j.to + (j.promotion || ""));
        if (r.estado === "sigue" && r.guion && !c.guionCompleto()) { c.rivalJuega(); }
        if (c.completo) return { nivel: c, linea: l };
        if (c.guionCompleto() && c.pasos.length && plano.exito === undefined) return { nivel: c, linea: l };
        const k = clave(c);
        if (vistos.has(k)) continue;
        vistos.add(k);
        sig.push({ n: c, linea: l });
      }
    }
    capa = sig;
    if (vistos.size > 3e6) return null;
  }
  return null;
}

function compararConChessJs(fen, donde) {
  const ch = new Chess();
  if (!ch.load(fen)) { mal(`${donde}: chess.js no acepta el FEN ${fen}`); return; }
  // El que no mueve no puede estar en jaque.
  const otro = new Chess(fen.replace(/ [wb] /, (m) => (m.trim() === "w" ? " b " : " w ")));
  if (otro.in_check()) { mal(`${donde}: posición ilegal, el rey del que no mueve está en jaque (${fen})`); return; }
  const a = ch.moves({ verbose: true }).map((m) => m.from + m.to + (m.promotion || "")).sort().join(" ");
  const b = new MiniChess(fen).moves().map((m) => m.from + m.to + (m.promotion || "")).sort().join(" ");
  if (a !== b) mal(`${donde}: MiniChess y chess.js no dan las mismas jugadas`);
}

let niveles = 0;
const t0 = Date.now();
// `node herramientas/verificar-aprende-a-jugar.js enroque` revisa solo esa etapa.
const SOLO = process.argv[2];
for (const e of ETAPAS) {
  if (SOLO && e.clave !== SOLO) { niveles += e.niveles.length; continue; }
  console.log(`Etapa ${e.numero}: ${e.titulo} (${e.niveles.length} niveles)`);
  if (!e.intro || !e.final || !e.subtitulo) mal(`${e.titulo}: falta la introducción, el subtítulo o el cierre`);
  for (const p of e.niveles) {
    niveles++;
    const donde = `${e.titulo}, nivel ${p.id}`;
    if (!p.meta) mal(`${donde}: sin meta escrita`);
    if (!(p.jugadas >= 1)) mal(`${donde}: sin número de jugadas`);
    (p.flechas || []).forEach((f) => {
      const [v] = f.split(":");
      if (!(v.length === 2 ? CASILLA.test(v) : CASILLA.test(v.slice(0, 2)) && CASILLA.test(v.slice(2, 4)))) mal(`${donde}: flecha rara «${f}»`);
    });
    p.estrellas.forEach((sq) => { if (!CASILLA.test(sq)) mal(`${donde}: estrella en «${sq}»`); else if (new MiniChess(p.fen).get(sq)) mal(`${donde}: hay una pieza donde va la estrella ${sq}`); });
    const fen = p.fen;
    if (/K/.test(fen.split(" ")[0]) && /k/.test(fen.split(" ")[0])) compararConChessJs(fen, donde);
    // El guion, jugada por jugada, tiene que ser legal cuando le toca.
    if (p.guion.length) {
      const g = new MiniChess(fen);
      p.guion.forEach((x) => {
        const u = typeof x === "string" ? x : x.jugada;
        const ok = g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
        if (!ok) mal(`${donde}: la jugada ${u} del guion no es legal`);
      });
    }
    const linea = LINEAS[e.clave + ":" + p.id];
    const sol = linea ? jugarLinea(p, linea) : resolver(p, p.jugadas);
    if (!sol) { mal(`${donde}: no se puede ganar en ${p.jugadas} jugada(s)`); continue; }
    const est = M.estrellasDelNivel(p, sol.nivel.puntos);
    if (est !== 3) mal(`${donde}: la mejor solución (${sol.linea.join(" ")}) da ${est} estrellas, no 3`);
    else console.log(`  ✓ nivel ${p.id}: ${sol.linea.join(" ")} (${sol.nivel.puntos} puntos)`);
  }
}

// Las puertas no prometen otros números.
const total = ETAPAS.length;
if (CATEGORIAS.reduce((a, c) => a + c.etapas.length, 0) !== total) mal("Hay etapas fuera de las categorías");
const cifra = `${total} etapas y ${niveles} niveles`;
["entreno/aprende-a-jugar.html", "js/aprende-a-jugar-etapas.js"].forEach((f) => {
  const t = fs.readFileSync(path.join(RAIZ, f), "utf8");
  const dicho = t.match(/(\d+) etapas y (\d+) niveles/);
  if (!dicho) mal(`${f} no dice cuántas etapas y niveles hay`);
  else if (dicho[0] !== cifra) mal(`${f} dice «${dicho[0]}», pero son ${cifra}`);
});

console.log(`\n${total} etapas, ${niveles} niveles revisados en ${((Date.now() - t0) / 1000).toFixed(1)} s.`);
if (fallos) { console.log(`✗ ${fallos} problema(s).`); process.exit(1); }
console.log("✓ Todas las lecciones de Aprende a jugar se pueden ganar con tres estrellas.");
