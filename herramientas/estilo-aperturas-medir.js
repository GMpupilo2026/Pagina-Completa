/* ===== El carácter de cada apertura, medido en partidas de maestros =====
 *
 * La recomendación de aperturas de la prueba de estilo (js/estilo-aperturas.js)
 * necesita saber de cada apertura del banco de «Aperturas y celadas»
 * (js/aperturas-lineas.js) cuánto ataca al rey, cuán abierto deja el juego y
 * cuánto se cambia. Eso no se pone a ojo: se mide, con las MISMAS funciones
 * de la prueba (js/estilo-medidas.js), en las partidas de maestros que
 * pasan por esa apertura: las del repositorio
 * (herramientas/lib/partidas-maestros.js) y las de torneos de ritmo clásico
 * transmitidos en Lichess que baja herramientas/estilo-aperturas-bajar.js
 * (sus primeras 40 medias jugadas en UCI, en
 * herramientas/datos/estilo-aperturas-partidas.txt). Con las del repositorio
 * solas había 7 italianas y ningún sistema Londres.
 *
 *   - Una partida «pasa por» una apertura si llega a su posición propia en las
 *     primeras 30 medias jugadas: por la posición y no por el orden de las
 *     jugadas, para que cuenten también las que llegan por transposición. La
 *     posición propia es la de la jugada más corta de la línea que ya no está
 *     en ninguna otra línea del banco (la Najdorf se separa del Dragón en
 *     5…a6).
 *   - Si de la variante hay menos de MINIMO partidas y la última jugada de su
 *     posición propia es del RIVAL, se quita esa jugada y se mide lo que queda
 *     (`base`): para quien elige la apertura, sus propias jugadas son las que
 *     la definen, y lo que conteste el rival es justamente lo que va a
 *     encontrarse. Una jugada propia no se quita nunca: medir el gambito de
 *     rey con todas las partidas de 1.e4 e5 sería medir la española. Si así
 *     tampoco alcanzan, la apertura queda sin medir y no se recomienda (no se
 *     recomienda lo que no se midió).
 *   - En cada partida, desde el bando que juega la apertura, en las jugadas
 *     12, 16 y 20 (medias jugadas 24, 32 y 40): la presión sobre el rey rival
 *     y las columnas abiertas menos los peones bloqueados (promediadas), y el
 *     material de piezas que salió del tablero hasta la jugada 20.
 *   - `car`, lo que usa la recomendación: cada medida comparada con las demás
 *     aperturas del mismo color (puntaje z), entre −1 y +1.
 *
 * La salida reemplaza el bloque entre MEDIDO-INICIO y MEDIDO-FIN de
 * js/estilo-aperturas.js, que NO se edita a mano. No hace falta motor:
 *
 *   node herramientas/estilo-aperturas-medir.js
 *
 * Lo comprueba herramientas/verificar-estilo-aperturas.js, que vuelve a
 * medir todo y exige el mismo resultado.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { Chess } = require("chess.js");
const M = require("../js/estilo-medidas");
const PartidasMaestros = require("./lib/partidas-maestros");
const { LINEAS } = require("../js/aperturas-lineas");

const RAIZ = path.join(__dirname, "..");
const CATALOGO = path.join(RAIZ, "js/estilo-aperturas.js");
const MINIMO = 15;
const BUSCAR_HASTA = 30;          // medias jugadas en las que se busca la posición
const MUESTRAS = [24, 32, 40];    // medias jugadas donde se mide
const INICIAL = new Chess().fen();
const PIEZAS_INICIO = M.piezas(INICIAL);

const clavePos = (fen) => fen.split(" ").slice(0, 2).join(" ");
function posTras(sans, k) {
  const c = new Chess();
  for (let i = 0; i < k; i++) if (!c.move(sans[i])) throw new Error("Jugada ilegal " + sans[i]);
  return clavePos(c.fen());
}

const TORNEOS = path.join(__dirname, "datos/estilo-aperturas-partidas.txt");

/* Todas las partidas: las del repositorio (en SAN) y las de torneos (en
 * UCI). Que no se repitan lo resuelve recorrer(). */
function todas() {
  const out = PartidasMaestros.leer(Chess).filter((p) => p.inicial === INICIAL).map((p) => ({ id: p.fuente + "|" + p.id, sans: p.sans }));
  if (fs.existsSync(TORNEOS)) {
    fs.readFileSync(TORNEOS, "utf8").split("\n").filter(Boolean).forEach((l, i) => out.push({ id: "torneos|" + (i + 1), ucis: l.split(" ") }));
  }
  return out;
}
const jugar = (c, p, i) => (p.ucis ? c.move({ from: p.ucis[i].slice(0, 2), to: p.ucis[i].slice(2, 4), promotion: p.ucis[i][4] }) : c.move(p.sans[i]));

/* Las posiciones por las que pasa cada partida (una vez, con su media jugada)
 * y los FEN de las medias jugadas de MUESTRAS. */
function recorrer(partidas) {
  const vistas = new Set();
  const out = [];
  for (const p of partidas) {
    const largo = (p.ucis || p.sans).length;
    if (largo < MUESTRAS[0]) continue;
    const c = new Chess();
    const pos = new Set();
    const fens = {};
    const camino = [];
    for (let i = 0; i < Math.max(BUSCAR_HASTA, MUESTRAS[MUESTRAS.length - 1]) && i < largo; i++) {
      if (!jugar(c, p, i)) break;
      const f = c.fen();
      camino.push(clavePos(f));
      if (i < BUSCAR_HASTA) pos.add(clavePos(f));
      if (MUESTRAS.includes(i + 1)) fens[i + 1] = f;
    }
    // La misma partida en el repositorio y en un torneo (o transmitida dos
    // veces) cuenta una vez: mismas posiciones en el mismo orden.
    const huella = camino.join("|");
    if (vistas.has(huella)) continue;
    vistas.add(huella);
    out.push({ id: p.id, pos, fens });
  }
  return out;
}

/* Lo de una partida desde `color`. */
function medirPartida(g, color) {
  const fs_ = MUESTRAS.map((k) => g.fens[k]).filter(Boolean);
  if (!fs_.length) return null;
  const prom = (f) => fs_.reduce((s, x) => s + f(x), 0) / fs_.length;
  return {
    ataque: prom((f) => M.presionSobreElRey(f, color)),
    estructura: prom((f) => M.apertura(f)),
    cambios: PIEZAS_INICIO - M.piezas(fs_[fs_.length - 1]),
  };
}

const r2 = (x) => Math.round(x * 100) / 100;

function medir() {
  const aperturas = LINEAS.filter((l) => l.tipo === "apertura");
  // Todas las posiciones de cada línea, para encontrar la propia.
  const posDe = new Map(aperturas.map((l) => [l.id, l.jugadas.map((_, k) => posTras(l.jugadas, k + 1))]));
  const juegos = recorrer(todas());
  const salida = [];
  for (const l of aperturas) {
    const propias = posDe.get(l.id);
    let propia = propias.findIndex((p) => !aperturas.some((o) => o.id !== l.id && posDe.get(o.id).includes(p)));
    // Dos líneas del banco iguales hasta el final: la más larga define.
    if (propia < 0) propia = propias.length - 1;
    // La media jugada i (desde 0) es de las blancas si i es par.
    const propiaDe = (i) => (i % 2 === 0 ? "w" : "b") === l.color;
    let k = propia + 1, pasan = [];
    for (; k >= 1; k--) {
      const p = posTras(l.jugadas, k);
      pasan = juegos.filter((g) => g.pos.has(p));
      if (pasan.length >= MINIMO) break;
      if (propiaDe(k - 1)) { k = 0; break; }   // no se quita una jugada propia
    }
    const contra = l.color === "b" ? l.jugadas[0] : null;
    if (k < 1) { salida.push({ id: l.id, color: l.color, contra, n: 0, define: l.jugadas.slice(0, propia + 1), base: null }); continue; }
    const medidas = pasan.map((g) => medirPartida(g, l.color)).filter(Boolean);
    const media = {};
    for (const e of ["ataque", "estructura", "cambios"]) media[e] = r2(medidas.reduce((s, x) => s + x[e], 0) / medidas.length);
    salida.push({
      id: l.id, color: l.color, contra, n: medidas.length,
      define: l.jugadas.slice(0, propia + 1),
      base: k === propia + 1 ? "variante" : l.jugadas.slice(0, k),
      media,
    });
  }
  // `car`: cada medida contra las demás aperturas del mismo color.
  for (const color of ["w", "b"]) {
    const del = salida.filter((x) => x.color === color && x.n);
    for (const e of ["ataque", "estructura", "cambios"]) {
      const v = del.map((x) => x.media[e]);
      const mu = v.reduce((s, x) => s + x, 0) / v.length;
      const sd = Math.sqrt(v.reduce((s, x) => s + (x - mu) ** 2, 0) / v.length) || 1;
      del.forEach((x) => { (x.car = x.car || {})[e] = r2(Math.max(-1, Math.min(1, (x.media[e] - mu) / sd / 2))); });
    }
  }
  return salida;
}

if (require.main === module) {
  const salida = medir();
  const texto = fs.readFileSync(CATALOGO, "utf8");
  const ini = texto.indexOf("/* MEDIDO-INICIO");
  const fin = texto.indexOf("/* MEDIDO-FIN */");
  if (ini < 0 || fin < 0) throw new Error("Faltan las marcas MEDIDO-INICIO / MEDIDO-FIN en " + CATALOGO);
  const finLinea = texto.indexOf("\n", ini) + 1;
  const cuerpo = "  const MEDIDO = [\n" + salida.map((x) => "    " + JSON.stringify(x)).join(",\n") + "\n  ];\n  ";
  fs.writeFileSync(CATALOGO, texto.slice(0, finLinea) + cuerpo + texto.slice(fin));
  const sin = salida.filter((x) => !x.n).map((x) => x.id);
  const familia = salida.filter((x) => x.n && x.base !== "variante").length;
  console.log("Listo: " + salida.length + " aperturas; " + (salida.length - sin.length) + " medidas (" + familia + " por su familia)"
    + (sin.length ? "; sin medir: " + sin.join(", ") : "") + ".");
}

module.exports = { medir, MINIMO, MUESTRAS, BUSCAR_HASTA };
