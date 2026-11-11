#!/usr/bin/env node
/* ===== Verificador: el bot de la profe Pame («Juega contra mí») =====
 *
 * Lo que arma herramientas/libro-profe-pame.js y cómo lo usa la página:
 *   - el libro, la procedencia y la calibración tienen la forma que espera
 *     js/chess-bot.js (la misma que los del profe Oscar);
 *   - ninguna jugada del libro es ilegal: se recorre el árbol desde la
 *     posición inicial (las jugadas del libro de ella y TODAS las del rival)
 *     y cada entrada que se encuentra se juega con chess.js;
 *   - chess-bot.js elige el perfil por js/avatar-profe-oscar.js: la profe
 *     Pame solo para CCDR POCOCI, Oscar para el resto;
 *   - tablero.html e index.html cargan el avatar y la calibración ANTES que el
 *     bot (si no, el bot nace siendo Oscar).
 *
 *   node herramientas/verificar-libro-profe-pame.js
 *
 * Ver «El bot de la profe Pame» en docs/decisiones/juegos-y-torneos.md.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { Chess } = require("chess.js");

const RAIZ = path.join(__dirname, "..");
const leer = (r) => fs.readFileSync(path.join(RAIZ, r), "utf8");
let fallos = 0;
function igual(nombre, a, b) {
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  if (sa !== sb) { console.log("  ✗ " + nombre + "\n      esperaba: " + sb + "\n      salió:    " + sa); fallos += 1; }
  else console.log("  ✓ " + nombre);
}

function fnv1a64Hex(str) {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n, mask = (1n << 64n) - 1n;
  for (let i = 0; i < str.length; i++) { h ^= BigInt(str.charCodeAt(i) & 0xff); h = (h * prime) & mask; }
  return h.toString(16).padStart(16, "0");
}
const hashDe = (fen) => fnv1a64Hex(fen.split(" ").slice(0, 4).join(" "));

console.log("\n=== El libro, la procedencia y la calibración ===");
const libro = JSON.parse(leer("data/pame-book.json"));
const prov = JSON.parse(leer("data/pame-book-provenance.json"));
const hashes = Object.keys(libro);
igual("tiene posiciones", hashes.length > 500, true);
igual("cada clave es un hash de 16 hex", hashes.filter((h) => !/^[0-9a-f]{16}$/.test(h)).length, 0);
igual("cada entrada es [uci, peso, …] con peso positivo, de mayor a menor",
  hashes.filter((h) => {
    const e = libro[h];
    if (!Array.isArray(e) || !e.length || e.length % 2) return true;
    for (let i = 0; i < e.length; i += 2) {
      if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(e[i]) || !(e[i + 1] > 0)) return true;
      if (i && e[i + 1] > e[i - 1]) return true;
    }
    return false;
  }).length, 0);
igual("la procedencia tiene una partida por jugada, y existe",
  hashes.filter((h) => {
    const m = prov.moves[h];
    return !m || m.length !== libro[h].length / 2 || m.some((g) => !prov.games[g]);
  }).length, 0);
igual("cada partida citada tiene color, rival, resultado, fecha, Elos y ritmo",
  prov.games.filter((g) => g.length !== 7 || !/^[wb]$/.test(g[0]) || !/^[WLD?]$/.test(g[2])).length, 0);
const w = {};
new Function("window", leer("js/pame-book.js"))(w);
igual("la calibración trae su Elo de bala (con el que juega en Difícil)",
  Number.isFinite(w.PAME_ELO_CALIB && w.PAME_ELO_CALIB.bullet && w.PAME_ELO_CALIB.bullet.recent_median_elo), true);

console.log("\n=== Ninguna jugada del libro es ilegal ===");
const inicial = hashDe(new Chess().fen());
igual("el libro conoce la posición inicial (ella con blancas)", !!libro[inicial], true);
// Desde la inicial: en cada posición del libro se juegan SUS jugadas, y en la
// siguiente, todas las del rival (ella pudo haber jugado con cualquiera de los
// dos colores). Cada entrada que se alcanza se comprueba jugada por jugada.
const vistas = new Set();
let ilegales = [];
let cola = [new Chess().fen()];
for (let ply = 0; ply < 40 && cola.length; ply++) {
  const siguiente = [];
  for (const fen of cola) {
    const g = new Chess(fen);
    const h = hashDe(fen);
    const entrada = libro[h];
    if (entrada && !vistas.has(h)) {
      vistas.add(h);
      for (let i = 0; i < entrada.length; i += 2) {
        const u = entrada[i];
        const c = new Chess(fen);
        if (!c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] })) ilegales.push(h + " " + u);
        else siguiente.push(c.fen());
      }
    }
    if (!entrada) continue;
    // Las del rival, solo después de una jugada de ella (para no explotar).
  }
  // Tras sus jugadas, todas las respuestas del rival que llevan a otra entrada.
  const conRival = [];
  for (const fen of siguiente) {
    const g = new Chess(fen);
    if (libro[hashDe(fen)]) conRival.push(fen);
    for (const m of g.moves({ verbose: true })) {
      const c = new Chess(fen); c.move(m);
      if (libro[hashDe(c.fen())]) conRival.push(c.fen());
    }
  }
  // Con negras: desde la inicial, cada primera jugada de las blancas.
  if (ply === 0) for (const m of new Chess().moves({ verbose: true })) { const c = new Chess(); c.move(m); if (libro[hashDe(c.fen())]) conRival.push(c.fen()); }
  cola = [...new Set(conRival)];
}
igual("las jugadas que se alcanzan desde la inicial son legales", ilegales, []);
igual("se alcanza la gran mayoría del libro", vistas.size / hashes.length > 0.6, true);

console.log("\n=== chess-bot.js: la profe Pame solo para CCDR POCOCI ===");
function botCon(profe) {
  const win = { OSCAR_ELO_CALIB: { bullet: { recent_median_elo: 2420 } }, PAME_ELO_CALIB: w.PAME_ELO_CALIB };
  if (profe) win.AvatarProfeOscar = { PROFE: profe };
  const src = leer("js/chess-bot.js") + "\nreturn OscarBot;";
  return new Function("window", "Chess", "document", "Worker", "fetch", src)(win, Chess, {}, function () {}, () => Promise.resolve({ ok: false }));
}
igual("quien ve a la profe Pame juega contra ella", [botCon("pame").PROFE, botCon("pame").NOMBRE], ["pame", "la profe Pame"]);
igual("el resto, contra Oscar", [botCon("oscar").PROFE, botCon("oscar").NOMBRE], ["oscar", "Oscar"]);
igual("sin el avatar cargado, Oscar", botCon(null).PROFE, "oscar");
const av = leer("js/avatar-profe-oscar.js");
igual("solo CCDR POCOCI apunta a la profe Pame", (av.match(/: "pame",/g) || []).length, 1);

console.log("\n=== Las páginas cargan el avatar y la calibración antes que el bot ===");
for (const pag of ["tablero.html", "index.html"]) {
  const html = leer(pag);
  const i = (s) => html.indexOf(s);
  igual(pag + ": avatar y calibración antes de chess-bot.js",
    i("js/avatar-profe-oscar.js") > 0 && i("js/pame-book.js") > 0 && i("js/avatar-profe-oscar.js") < i("js/chess-bot.js") && i("js/pame-book.js") < i("js/chess-bot.js"), true);
}

console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron.` : "\n✓ Todo bien.");
process.exit(fallos ? 1 : 0);

/*! rev bfb5bbb0d2d82f9f */
