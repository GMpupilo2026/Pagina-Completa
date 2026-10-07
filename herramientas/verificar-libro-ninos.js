/* Verifica los cuentos de Peonita (herramientas/libro-ninos/: la lista está
 * en libros.js) y lo que genera herramientas/libro-ninos-pdf.js.
 *
 * Ninguna posición se inventa: cada FEN tiene que cargar en chess.js, y CADA
 * respuesta escrita a mano en el contenido se vuelve a calcular acá, desde la
 * posición, sin usar nada del generador:
 *   - contar / destinos / comer: las jugadas de la pieza, contadas por chess.js;
 *   - jaque, mate, ahogado: lo que dice chess.js de la posición;
 *   - mate en una: que haya UNA sola jugada que da mate y que sea la escrita;
 *   - salida: que el jaque se salve de una sola de las tres formas, la escrita;
 *   - enroque: que el enroque corto esté (o no) entre las jugadas legales;
 *   - saltos del caballo: el camino más corto, contado casilla por casilla;
 *   - puntos y cambios: con la tabla de valores;
 *   - el nombre de una casilla: que la estrella esté donde dice la respuesta;
 *   - los trucos (gana, amenaza, defensa): con el buscador de
 *     lib/tactica.js, que la jugada de la respuesta sea la ÚNICA que gana el
 *     material que promete, y que cada defensa propuesta la evite de verdad.
 * Una posición de juego (con los dos reyes) además tiene que ser legal: que
 * no esté en jaque el rey del que NO mueve.
 *
 * Revisa también los secretos para Alessandro de cada libro (un acróstico o un
 * anagrama se rompen con una corrección y nadie lo nota, justo porque están
 * escondidos), y lo generado: que exista el PDF y que la versión accesible
 * traiga todos los capítulos y una descripción de cada dibujo.
 *
 *   node herramientas/verificar-libro-ninos.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { Chess } = require("chess.js");
const LIBROS = require("./libro-ninos/libros.js");
const D = require("./libro-ninos/dibujos.js");
const { ganancias, MATE } = require("./lib/tactica.js");

const RAIZ = path.join(__dirname, "..");
const fallos = [];
let comprobadas = 0;
const ok = (cond, msg) => { if (!cond) fallos.push(msg); };

const ESP = { K: "R", Q: "D", R: "T", B: "A", N: "C" };
// Sin «+» ni «#»: el libro escribe «Ce7+» para que el niño vea que es jaque.
const sinJaque = (t) => t.replace(/[+#]/g, "");
const enEspanol = (san) => san.replace(/[+#]/g, "").replace(/^[KQRBN]/, (c) => ESP[c]).replace(/=([QRBN])/, (_, c) => "=" + ESP[c]);

function cargar(fen, donde) {
  const g = new Chess();
  const v = g.validate_fen(fen);
  if (!v.valid) { fallos.push(`${donde}: la FEN no es válida (${v.error})`); return null; }
  g.load(fen);
  const tablero = fen.split(" ")[0];
  if (/K/.test(tablero) && /k/.test(tablero)) {
    // Posición de juego: el rey del que no mueve no puede estar en jaque.
    const partes = fen.split(" ");
    partes[1] = partes[1] === "w" ? "b" : "w";
    partes[3] = "-";
    const otro = new Chess(partes.join(" "));
    ok(!otro.in_check(), `${donde}: está en jaque el rey del bando que no mueve`);
    ok((tablero.match(/K/g) || []).length === 1 && (tablero.match(/k/g) || []).length === 1, `${donde}: hay más de un rey de un color`);
  }
  comprobadas++;
  return g;
}

const movimientos = (g, casilla) => g.moves({ square: casilla, verbose: true });
function saltosCaballo(desde, hasta) {
  const xy = (s) => ["abcdefgh".indexOf(s[0]), +s[1] - 1];
  const [hx, hy] = xy(hasta);
  let frente = [xy(desde)], vistos = new Set([desde]), n = 0;
  while (frente.length) {
    if (frente.some(([x, y]) => x === hx && y === hy)) return n;
    const sig = [];
    frente.forEach(([x, y]) => [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]].forEach(([dx, dy]) => {
      const nx = x + dx, ny = y + dy, k = "abcdefgh"[nx] + (ny + 1);
      if (nx >= 0 && nx < 8 && ny >= 0 && ny < 8 && !vistos.has(k)) { vistos.add(k); sig.push([nx, ny]); }
    }));
    frente = sig; n++;
  }
  return -1;
}
let L;   // el libro que se está revisando
const valor = (piezas) => [...piezas].reduce((s, p) => s + L.VALOR[p], 0);
const CASILLA = /^[a-h][1-8]$/;

/* La jugada que más gana, y si es la única que llega a `minimo`. */
function trucoUnico(fen, respuesta, minimo, donde) {
  const todas = ganancias(fen, 4);
  const llegan = todas.filter((x) => x.gana >= minimo);
  ok(llegan.length === 1, `${donde}: hay ${llegan.length} jugadas que ganan ${minimo} o más (${llegan.map((x) => enEspanol(x.san) + " " + x.gana).join(", ")})`);
  ok(llegan.length && enEspanol(llegan[0].san) === sinJaque(respuesta), `${donde}: la jugada que gana es ${llegan.map((x) => enEspanol(x.san))}, no ${respuesta}`);
}
function turnoDelOtro(fen) {
  const p = fen.split(" ");
  p[1] = p[1] === "w" ? "b" : "w";
  p[3] = "-";
  return p.join(" ");
}

function formasDeSalir(g) {
  const formas = new Set();
  g.moves({ verbose: true }).forEach((m) => {
    if (m.piece === "k") formas.add("huir");
    else if (m.captured) formas.add("comer");
    else formas.add("tapar");
  });
  return formas;
}

function verificarLibro(libro) {
L = libro;
L.CAPITULOS.forEach((cap) => {
  (cap.muestras || []).forEach((m, i) => {
    const donde = `${L.SLUG}, capítulo ${cap.n}, diagrama ${i + 1}`;
    const g = cargar(m.fen, donde);
    if (!g) return;
    if (m.casilla) ok(g.get(m.casilla), `${donde}: no hay pieza en ${m.casilla}`);
    (m.flechas || []).forEach(([a, b]) => ok(CASILLA.test(a) && CASILLA.test(b) && g.get(a), `${donde}: la flecha ${a}→${b} no sale de una pieza`));
    if (m.desde) {
      const h = new Chess(m.desde.fen);
      (m.desde.jugadas || [m.desde.jugada]).forEach((j) => ok(h.move(j), `${donde}: la jugada ${j} no es legal`));
      ok(h.fen().split(" ")[0] === m.fen.split(" ")[0], `${donde}: la posición no es la que sale de las jugadas (${h.fen()})`);
    }
  });

  cap.ejercicios.forEach((e, i) => {
    const donde = `${L.SLUG}, capítulo ${cap.n}, ejercicio ${i + 1} (${e.tipo})`;
    if (["tableros", "colorear", "unir", "promesas", "partida"].includes(e.tipo)) return;
    if (e.tipo === "puntos") {
      const sumas = e.grupos.map((gr) => valor(gr.piezas));
      const max = Math.max(...sumas);
      ok(sumas.filter((s) => s === max).length === 1, `${donde}: empatan`);
      ok(e.grupos[sumas.indexOf(max)].nombre === e.respuesta, `${donde}: suma más ${e.grupos[sumas.indexOf(max)].nombre}, no ${e.respuesta}`);
      return;
    }
    if (e.tipo === "cambio") {
      const dice = L.VALOR[e.recibes] > L.VALOR[e.das] ? "bueno" : L.VALOR[e.recibes] < L.VALOR[e.das] ? "malo" : "parejo";
      ok(dice === e.respuesta, `${donde}: el cambio es ${dice}, no ${e.respuesta}`);
      return;
    }
    if (e.tipo === "suma") { ok(valor(e.piezas) === e.respuesta, `${donde}: suman ${valor(e.piezas)}, no ${e.respuesta}`); return; }
    if (e.tipo === "texto" && !e.fen) return;

    const g = cargar(e.fen, donde);
    if (!g) return;
    if (e.casilla) ok(g.get(e.casilla), `${donde}: no hay pieza en ${e.casilla}`);
    const mov = e.casilla ? movimientos(g, e.casilla) : [];
    const destinos = [...new Set(mov.map((m) => m.to))].sort();
    switch (e.tipo) {
      case "texto": break;
      case "casilla": ok(e.estrellas.length === 1 && e.estrellas[0] === e.respuesta, `${donde}: la estrella está en ${e.estrellas}, no en ${e.respuesta}`); break;
      case "contar":
        ok(destinos.length === e.respuesta, `${donde}: la pieza va a ${destinos.length} casillas, no a ${e.respuesta}`); break;
      case "destinos":
        ok(JSON.stringify(destinos) === JSON.stringify([...e.respuesta].sort()), `${donde}: va a [${destinos}], no a [${e.respuesta}]`); break;
      case "comer": {
        const capturas = mov.filter((m) => m.captured).map((m) => m.to);
        ok(capturas.length === 1 && capturas[0] === e.respuesta, `${donde}: puede comer en [${capturas}], se esperaba solo ${e.respuesta}`); break;
      }
      case "color": {
        const p = g.get(e.casilla);
        ok(p && p.type === "b", `${donde}: la pieza no es un alfil`);
        ok((g.square_color(e.casilla) === g.square_color(e.meta)) === e.respuesta, `${donde}: la respuesta no coincide con el color de las casillas`); break;
      }
      case "saltos": {
        const p = g.get(e.casilla);
        ok(p && p.type === "n", `${donde}: la pieza no es un caballo`);
        ok(saltosCaballo(e.casilla, e.meta) === e.respuesta, `${donde}: necesita ${saltosCaballo(e.casilla, e.meta)} saltos, no ${e.respuesta}`); break;
      }
      case "jaque": ok(g.in_check() === e.respuesta, `${donde}: jaque = ${g.in_check()}`); break;
      case "salida": {
        ok(g.in_check(), `${donde}: el rey no está en jaque`);
        const f = [...formasDeSalir(g)];
        ok(f.length === 1 && f[0] === e.respuesta, `${donde}: se sale con [${f}], se esperaba solo ${e.respuesta}`); break;
      }
      case "mate": {
        ok(!g.in_check(), `${donde}: el que mueve ya está en jaque`);
        const mates = g.moves().filter((m) => { const h = new Chess(g.fen()); h.move(m); return h.in_checkmate(); });
        ok(mates.length === 1, `${donde}: hay ${mates.length} jugadas que dan mate (${mates})`);
        ok(mates.length && enEspanol(mates[0]) === e.respuesta, `${donde}: el mate es ${mates.map(enEspanol)}, no ${e.respuesta}`); break;
      }
      case "final": {
        const dice = g.in_checkmate() ? "mate" : g.in_stalemate() ? "ahogado" : "ninguno";
        ok(dice === e.respuesta, `${donde}: es ${dice}, no ${e.respuesta}`); break;
      }
      case "enroque": ok(g.moves().includes("O-O") === e.respuesta, `${donde}: el enroque corto ${g.moves().includes("O-O") ? "sí" : "no"} se puede`); break;
      case "gana": trucoUnico(e.fen, e.respuesta, e.minimo, donde); break;
      case "amenaza": {
        // Le toca a Peonita, pero la pregunta es qué haría Tizón: se le da el
        // turno a las negras. Esa posición también tiene que ser legal.
        const otro = cargar(turnoDelOtro(e.fen), donde + " con el turno de las negras");
        if (otro) trucoUnico(turnoDelOtro(e.fen), e.respuesta, e.minimo, donde);
        break;
      }
      case "defensa": {
        e.jugadas.forEach((j) => {
          const h = new Chess(e.fen);
          const san = h.moves().find((x) => enEspanol(x) === sinJaque(j));
          if (!san) { fallos.push(`${donde}: ${j} no es una jugada legal`); return; }
          h.move(san);
          const mejor = Math.max(...ganancias(h.fen(), 4).map((x) => x.gana));
          ok(mejor < e.minimo, `${donde}: después de ${j}, las negras todavía ganan ${mejor >= MATE ? "con mate" : mejor}`);
        });
        break;
      }
      case "corona": {
        const coronas = mov.filter((m) => m.promotion).map((m) => m.promotion).sort().join("");
        ok(coronas === "bnqr", `${donde}: el peón no puede coronar en las cuatro piezas`); break;
      }
      default: fallos.push(`${donde}: tipo de ejercicio desconocido`);
    }
  });
});

// Los secretos para Alessandro: una corrección del poema, de un título o del
// nombre de un personaje los rompería sin que nadie lo note.
ok(L.SECRETOS && L.SECRETOS.length, `${L.SLUG}: no tiene ningún secreto para Alessandro (ver «Cada cuento lleva un secreto para Alessandro»)`);
const inicial = (t) => t.normalize("NFD").replace(/[^A-Za-z]/g, "")[0].toUpperCase();
const letras = (t) => t.normalize("NFD").toUpperCase().replace(/[^A-Z]/g, "").split("").sort().join("");
(L.SECRETOS || []).forEach((sec) => {
  if (sec.tipo === "acrostico-dedicatoria") {
    ok(L.DEDICATORIA.map(inicial).join("") === L.SECRETO, `${L.SLUG}: la dedicatoria ya no forma el acróstico ${L.SECRETO}`);
  } else if (sec.tipo === "acrostico-titulos") {
    ok(L.CAPITULOS.map((c) => inicial(c.titulo)).join("") === L.SECRETO, `${L.SLUG}: los títulos de los capítulos ya no forman el acróstico ${L.SECRETO}`);
  } else if (sec.tipo === "anagrama") {
    ok(letras(sec.nombre) === letras(L.SECRETO), `${L.SLUG}: «${sec.nombre}» ya no tiene las mismas letras que ${L.SECRETO}`);
    ok(JSON.stringify(L.CAPITULOS).includes(sec.nombre), `${L.SLUG}: «${sec.nombre}» ya no aparece en el cuento`);
  } else if (sec.tipo === "sol-bebe") {
    const conSol = L.CAPITULOS.filter((c) => c.escena.sol === "bebe");
    ok(conSol.length === 1 && (conSol[0].escena.fondo || "dia") === "dia", `${L.SLUG}: tiene que haber un solo sol de bebé, en una escena de día (hay ${conSol.length})`);
    ok(conSol.length !== 1 || D.escena(conSol[0].escena).includes('data-secreto="sol-bebe"'), `${L.SLUG}: la escena del sol de bebé ya no lo dibuja`);
  } else if (sec.tipo === "grabado") {
    ok(L.SECRETO.startsWith(sec.texto), `${L.SLUG}: el grabado «${sec.texto}» no es parte de ${L.SECRETO}`);
    ok(L.CAPITULOS.some((c) => c.escena.contenido.includes(`data-grabado="${sec.texto}"`)), `${L.SLUG}: ya no hay ningún árbol con el grabado «${sec.texto}»`);
  } else {
    fallos.push(`${L.SLUG}: secreto de tipo desconocido (${sec.tipo})`);
  }
});

// Lo generado.
const CARPETA = path.join(RAIZ, "material", L.SLUG);
const acc = path.join(CARPETA, L.SLUG + "-accesible.html");
if (fs.existsSync(acc)) {
  const html = fs.readFileSync(acc, "utf8");
  L.CAPITULOS.forEach((c) => {
    ok(html.includes(c.titulo), `${L.SLUG}: la versión accesible no tiene el capítulo «${c.titulo}»: hay que volver a correr libro-ninos-pdf.js`);
    ok(html.includes(c.escena.alt), `${L.SLUG}: la versión accesible no describe el dibujo del capítulo ${c.n}`);
  });
  ok(!/<img|<svg/i.test(html), `${L.SLUG}: la versión accesible tiene imágenes: tiene que ser solo texto`);
  ok(html.includes(L.AUTOR), `${L.SLUG}: la versión accesible no dice quién es el autor`);
} else {
  fallos.push(`falta material/${L.SLUG}/${L.SLUG}-accesible.html: hay que correr herramientas/libro-ninos-pdf.js`);
}
ok(fs.existsSync(path.join(CARPETA, L.SLUG + ".pdf")), `falta material/${L.SLUG}/${L.SLUG}.pdf`);
}

LIBROS.forEach(verificarLibro);
ok(new Set(LIBROS.map((l) => l.SLUG)).size === LIBROS.length, "dos libros tienen el mismo slug");

if (fallos.length) {
  console.error(`✗ ${fallos.length} fallo(s):\n  - ` + fallos.join("\n  - "));
  process.exit(1);
}
console.log(`✓ Los cuentos de Peonita: ${LIBROS.map((l) => `${l.SLUG} (${l.CAPITULOS.length} capítulos, ${l.CAPITULOS.reduce((s, c) => s + c.ejercicios.length, 0)} ejercicios)`).join(", ")}; ${comprobadas} posiciones comprobadas con chess.js.`);
