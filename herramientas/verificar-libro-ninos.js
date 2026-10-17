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
 *     material que promete, y que cada defensa propuesta la evite de verdad;
 *   - mate en dos: que la jugada escrita sea la ÚNICA primera jugada que deja
 *     un mate en una para cada respuesta del negro (y que no haya mate en una);
 *   - elegir entre dos jugadas: lo que deja cada una (mate, ahogado…).
 * Si un ejercicio trae su propia frase de solución, tiene que nombrar la
 * jugada de la respuesta.
 * Una posición de juego (con los dos reyes) además tiene que ser legal: que
 * no esté en jaque el rey del que NO mueve.
 *
 * Revisa también los secretos para Alessandro de cada libro (un acróstico o un
 * anagrama se rompen con una corrección y nadie lo nota, justo porque están
 * escondidos), y lo generado: que exista el PDF, que la versión accesible
 * traiga todos los capítulos y una descripción de cada dibujo, y que el PDF
 * adaptado esté etiquetado, sin cifrar, en español, con todo el cuento, con
 * su XMP de PDF/UA-1 y sin contenido suelto (ni etiquetado ni Artifact), y
 * que el Word adaptado tenga sus títulos, su idioma y las imágenes decorativas,
 * que el EPUB sea un EPUB accesible de este libro, que los ejercicios para
 * quien no ve se hagan con las manos y no pidan nada que solo se ve, y que el
 * guion del audiolibro esté al día y con sus voces.
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

const matesEnUna = (fen) => new Chess(fen).moves().filter((m) => { const h = new Chess(fen); h.move(m); return h.in_checkmate(); });
/* ¿Esta primera jugada da mate en dos, conteste lo que conteste el negro? */
function mateEnDos(fen, jugada) {
  const h = new Chess(fen);
  h.move(jugada);
  if (h.in_checkmate() || h.in_stalemate()) return false;
  return h.moves().every((r) => { const k = new Chess(h.fen()); k.move(r); return matesEnUna(k.fen()).length > 0; });
}
function queDeja(fen, jugada) {
  const h = new Chess(fen);
  const san = h.moves().find((x) => enEspanol(x) === sinJaque(jugada));
  if (!san) return "ilegal";
  h.move(san);
  return h.in_checkmate() ? "mate" : h.in_stalemate() ? "ahogado" : h.in_check() ? "jaque" : "nada";
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
    if (e.solucion) ok(typeof e.respuesta === "string" && e.solucion.includes(e.respuesta), `${donde}: la frase de la solución no nombra la respuesta ${e.respuesta}`);
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
      case "mate2": {
        ok(!matesEnUna(e.fen).length, `${donde}: ya hay mate en una (${matesEnUna(e.fen).map(enEspanol)})`);
        const primeras = g.moves().filter((m) => mateEnDos(e.fen, m));
        ok(primeras.length === 1, `${donde}: hay ${primeras.length} primeras jugadas que dan mate en dos (${primeras.map(enEspanol)})`);
        ok(primeras.length && enEspanol(primeras[0]) === sinJaque(e.respuesta), `${donde}: el mate en dos empieza con ${primeras.map(enEspanol)}, no con ${e.respuesta}`); break;
      }
      case "elige": {
        Object.entries(e.opciones).forEach(([j, deja]) => { const r = queDeja(e.fen, j); ok(r === deja, `${donde}: ${j} deja ${r}, no ${deja}`); });
        ok(e.opciones[e.respuesta] === "mate", `${donde}: la respuesta ${e.respuesta} no es la opción que da mate`); break;
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
// Un secreto con `para` es para otra persona (el libro 3 lleva tres para
// Karina): se compara con ese nombre en lugar de SECRETO.
(L.SECRETOS || []).forEach((sec) => {
  const nombre = sec.para || L.SECRETO;
  if (sec.tipo === "acrostico-dedicatoria") {
    ok(L.DEDICATORIA.map(inicial).join("") === nombre, `${L.SLUG}: la dedicatoria ya no forma el acróstico ${nombre}`);
  } else if (sec.tipo === "acrostico-titulos") {
    ok(L.CAPITULOS.map((c) => inicial(c.titulo)).join("") === L.SECRETO, `${L.SLUG}: los títulos de los capítulos ya no forman el acróstico ${L.SECRETO}`);
  } else if (sec.tipo === "anagrama") {
    ok(letras(sec.nombre) === letras(L.SECRETO), `${L.SLUG}: «${sec.nombre}» ya no tiene las mismas letras que ${L.SECRETO}`);
    ok(JSON.stringify(L.CAPITULOS).includes(sec.nombre), `${L.SLUG}: «${sec.nombre}» ya no aparece en el cuento`);
  } else if (sec.tipo === "sol-bebe" || sec.tipo === "sol-gatea") {
    // El sol que es Alessandro: uno solo por libro, en una escena de día.
    const cual = sec.tipo.slice(4);
    const conSol = L.CAPITULOS.filter((c) => c.escena.sol);
    ok(conSol.length === 1 && conSol[0].escena.sol === cual && (conSol[0].escena.fondo || "dia") === "dia", `${L.SLUG}: tiene que haber un solo sol «${cual}», en una escena de día (hay ${conSol.length} escenas con un sol distinto)`);
    ok(conSol.length !== 1 || D.escena(conSol[0].escena).includes('data-secreto="sol-bebe"'), `${L.SLUG}: la escena del sol ya no dibuja a Alessandro`);
  } else if (sec.tipo === "personaje") {
    ok(L.SECRETO.toUpperCase().endsWith(sec.nombre.toUpperCase()), `${L.SLUG}: «${sec.nombre}» ya no es parte de ${L.SECRETO}`);
    ok(L.CAPITULOS.some((c) => c.cuento.some((t) => t.includes(sec.nombre))), `${L.SLUG}: «${sec.nombre}» ya no aparece en el cuento`);
  } else if (sec.tipo === "acrostico-soluciones") {
    // Las soluciones de un capítulo, de arriba hacia abajo, empiezan con las
    // letras del secreto: tienen que ser frases escritas (`solucion`).
    const cap = L.CAPITULOS.find((c) => c.n === sec.capitulo);
    ok(cap && cap.ejercicios.every((e) => e.solucion), `${L.SLUG}: las soluciones del capítulo ${sec.capitulo} tienen que ir escritas a mano para formar ${sec.texto}`);
    ok(cap && cap.ejercicios.map((e) => inicial(e.solucion || "?")).join("") === sec.texto, `${L.SLUG}: las soluciones del capítulo ${sec.capitulo} ya no empiezan con ${sec.texto}`);
    ok(L.SECRETO.startsWith(sec.texto), `${L.SLUG}: «${sec.texto}» no es parte de ${L.SECRETO}`);
  } else if (sec.tipo === "grabado") {
    ok(sec.para ? sec.texto.startsWith(nombre[0]) : nombre.startsWith(sec.texto), `${L.SLUG}: el grabado «${sec.texto}» no es parte de ${nombre}`);
    ok(L.CAPITULOS.some((c) => c.escena.contenido.includes(`data-grabado="${sec.texto}"`)), `${L.SLUG}: ya no hay ningún dibujo con el grabado «${sec.texto}»`);
  } else if (sec.tipo === "constelacion") {
    const cap = L.CAPITULOS.find((c) => c.n === sec.capitulo);
    ok(nombre.startsWith(sec.letra), `${L.SLUG}: la constelación «${sec.letra}» no es la inicial de ${nombre}`);
    ok(cap && cap.escena.fondo === "noche" && cap.escena.contenido.includes(`data-constelacion="${sec.letra}"`), `${L.SLUG}: el cielo de noche del capítulo ${sec.capitulo} ya no tiene la constelación «${sec.letra}»`);
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
  // Con las manos: un niño ciego hace los ejercicios en un tablero táctil.
  // Cada ejercicio con posición dice qué armar y qué tocar, y ni los
  // ejercicios ni las soluciones le piden algo que solo se ve (la casilla
  // amarilla, la estrella, marcar con una ✗, pintar). Los nombres propios
  // («la Dama Estrella», «caminos de colores») y el aviso de dónde estaba la
  // estrella del libro sí pueden ir.
  const conPosicion = L.CAPITULOS.reduce((n, c) => n + c.ejercicios.filter((e) => e.fen).length, 0);
  const manos = (html.match(/<strong>Con las manos\.<\/strong>/g) || []).length;
  ok(manos >= conPosicion, `${L.SLUG}: la versión accesible dice «Con las manos» ${manos} veces y hay ${conPosicion} ejercicios con posición: cada uno tiene que decir qué armar y qué tocar`);
  ok(html.includes("<h2>Para leer con las manos</h2>"), `${L.SLUG}: la versión accesible no explica cómo leer el libro con un tablero táctil`);
  const ejercicios = (html.match(/<h3>¡A jugar!<\/h3><ol>[\s\S]*?<\/ol>\s*<\/section>/g) || []).join(" ") + html.slice(html.indexOf("<h2>Soluciones</h2>"));
  const plano = ejercicios.replace(/<[^>]+>/g, " ").replace(/Dama Estrella|caminos de colores|en el libro, ahí hay una estrella|la de la estrella del libro/g, "");
  const VISUAL = /amarill|estrella|✗|encierra|\bpinta|colorea|\bmira\b|\bves\b|puntos? verdes?|flecha|círculo|marca con/gi;
  const vistas = [...new Set(plano.match(VISUAL) || [])];
  ok(!vistas.length, `${L.SLUG}: los ejercicios o las soluciones de la versión accesible piden algo que solo se ve: ${vistas.join(", ")}`);
  ok(html.includes(L.AUTOR), `${L.SLUG}: la versión accesible no dice quién es el autor`);
} else {
  fallos.push(`falta material/${L.SLUG}/${L.SLUG}-accesible.html: hay que correr herramientas/libro-ninos-pdf.js`);
}
ok(fs.existsSync(path.join(CARPETA, L.SLUG + ".pdf")), `falta material/${L.SLUG}/${L.SLUG}.pdf`);

// El PDF adaptado (letra grande, para quien ve poco o no ve). Lo que lo hace
// adaptado no se ve a simple vista, y se pierde sin ningún error: un
// PdfWriter que copia página por página bota las etiquetas, un cifrado de más
// estorba al lector de pantalla. Se lee con pypdf.
const adap = path.join(CARPETA, L.SLUG + "-adaptado.pdf");
if (fs.existsSync(adap)) {
  const guion = `
import sys, json
from pypdf import PdfReader
r = PdfReader(sys.argv[1])
raiz = r.trailer["/Root"]
prefs = raiz.get("/ViewerPreferences")
marca = raiz.get("/MarkInfo")
# Lo que se pinta fuera de toda secuencia marcada (ni etiquetado ni
# Artifact): PDF/UA-1 lo prohíbe (7.1-3) y veraPDF lo rechaza.
PINTA = {b"S", b"s", b"f", b"F", b"f*", b"B", b"B*", b"b", b"b*", b"Do", b"sh", b"INLINE IMAGE", b"Tj", b"TJ", b"'", b'"'}
from pypdf.generic import ContentStream
sueltos = 0
for pag in r.pages:
    nivel = 0
    for _, op in ContentStream(pag.get_contents(), r).operations:
        if op in (b"BMC", b"BDC"): nivel += 1
        elif op == b"EMC": nivel -= 1
        elif nivel == 0 and op in PINTA: sueltos += 1
xmp = raiz.get("/Metadata")
xmp = xmp.get_object().get_data().decode("utf-8", "replace") if xmp is not None else ""
def titulos(o):
    for x in o:
        if isinstance(x, list): yield from titulos(x)
        else: yield x.title
print(json.dumps({
  "cifrado": r.is_encrypted,
  "etiquetado": bool(marca and marca.get_object().get("/Marked")) and "/StructTreeRoot" in raiz,
  "idioma": str(raiz.get("/Lang", "")),
  "titulo_visible": bool(prefs and prefs.get_object().get("/DisplayDocTitle")),
  "titulo": (r.metadata or {}).get("/Title", ""),
  "marcadores": list(titulos(r.outline)),
  "texto": "".join(p.extract_text() for p in r.pages),
  "sueltos": sueltos,
  "pdfua": "<pdfuaid:part>1</pdfuaid:part>" in xmp,
}))`;
  let d = null;
  try {
    d = JSON.parse(require("child_process").execFileSync("python3", ["-c", guion, adap], { maxBuffer: 64 * 1024 * 1024 }));
  } catch (e) {
    fallos.push(`${L.SLUG}: no se pudo leer el PDF adaptado (¿falta pypdf? pip install pypdf)`);
  }
  if (d) {
    // pypdf saca el texto con los renglones cortados donde cae el salto: se
    // compara sin espacios.
    const junto = (t) => String(t).replace(/\s+/g, "");
    const texto = junto(d.texto);
    ok(!d.cifrado, `${L.SLUG}: el PDF adaptado está cifrado: el cifrado estorba al lector de pantalla`);
    ok(d.etiquetado, `${L.SLUG}: el PDF adaptado no está etiquetado (tagged): el lector de pantalla no sabe qué es título ni en qué orden se lee`);
    ok(/^es/.test(d.idioma), `${L.SLUG}: el PDF adaptado no dice que está en español (/Lang)`);
    ok(d.titulo_visible && d.titulo.includes(L.TITULO), `${L.SLUG}: el PDF adaptado no muestra su título`);
    ok(d.pdfua, `${L.SLUG}: el PDF adaptado no dice en su XMP que es PDF/UA-1 (pdfuaid:part): ¿se saltó pdf-adaptado.py?`);
    ok(d.sueltos === 0, `${L.SLUG}: el PDF adaptado tiene ${d.sueltos} trozo(s) de contenido sin etiquetar ni marcar como Artifact: PDF/UA-1 lo rechaza (¿se saltó pdf-adaptado.py?)`);
    ok(d.marcadores.length > 0, `${L.SLUG}: el PDF adaptado no tiene marcadores para saltar de capítulo`);
    L.CAPITULOS.forEach((c) => {
      ok(texto.includes(junto(c.titulo)), `${L.SLUG}: el PDF adaptado no tiene el capítulo «${c.titulo}»: hay que volver a correr libro-ninos-pdf.js`);
      ok(texto.includes(junto(c.escena.alt)), `${L.SLUG}: el PDF adaptado no cuenta el dibujo del capítulo ${c.n}`);
    });
    ok(texto.includes(junto("Soluciones")), `${L.SLUG}: el PDF adaptado no trae las soluciones`);
  }
} else {
  fallos.push(`falta material/${L.SLUG}/${L.SLUG}-adaptado.pdf: hay que correr herramientas/libro-ninos-pdf.js --solo-adaptado`);
}

// El Word adaptado: lo que lo hace accesible tampoco se ve a simple vista.
// Los títulos con los estilos de Word (el lector de pantalla y el panel de
// navegación saltan por ellos), el idioma, el título del documento, cada
// imagen marcada como decorativa (si no, el Comprobador de accesibilidad de
// Word pide texto alternativo y el lector la anuncia) y el interlineado
// automático (con uno exacto, LibreOffice recorta las imágenes).
const docx = path.join(CARPETA, L.SLUG + "-adaptado.docx");
if (fs.existsSync(docx)) {
  const guionW = `
import sys, json, re, zipfile
from docx import Document
d = Document(sys.argv[1])
z = zipfile.ZipFile(sys.argv[1])
xml = z.read("word/document.xml").decode("utf-8")
estilos = z.read("word/styles.xml").decode("utf-8")
print(json.dumps({
  "titulo": d.core_properties.title or "",
  "idioma": bool(re.search(r'<w:docDefaults>.*?<w:lang w:val="es-CR"', estilos, re.S)),
  "titulos2": [p.text for p in d.paragraphs if p.style is not None and p.style.name == "Heading 2"],
  "h1": sum(1 for p in d.paragraphs if p.style is not None and p.style.name == "Heading 1"),
  "estilos_repetidos": len(re.findall(r'w:styleId="Heading1"', estilos)),
  "imagenes": len(re.findall(r"<wp:docPr\\b", xml)),
  "decorativas": len(re.findall(r'<adec:decorative [^>]*val="1"', xml)),
  "exactos": len(re.findall(r'w:lineRule="exact"', xml + estilos)),
  "sin_regla": len(re.findall(r'<w:spacing(?![^>]*w:lineRule)[^>]*w:line="', xml + estilos)),
  "listas": len(re.findall(r"<w:numPr>", xml)),
  "texto": " ".join(p.text for p in d.paragraphs),
}))`;
  let w = null;
  try {
    w = JSON.parse(require("child_process").execFileSync("python3", ["-c", guionW, docx], { maxBuffer: 64 * 1024 * 1024 }));
  } catch (e) {
    fallos.push(`${L.SLUG}: no se pudo leer el Word adaptado (¿falta python-docx? pip install python-docx)`);
  }
  if (w) {
    const junto = (t) => String(t).replace(/\s+/g, "");
    const texto = junto(w.texto);
    ok(w.titulo.includes(L.TITULO), `${L.SLUG}: el Word adaptado no tiene su título en las propiedades del documento`);
    ok(w.idioma, `${L.SLUG}: el Word adaptado no está en español (Costa Rica): el lector de pantalla lo pronunciaría en otro idioma`);
    ok(w.h1 === 1 && w.estilos_repetidos === 1, `${L.SLUG}: el Word adaptado tiene que tener un solo título principal y un solo estilo «Heading1» (hay ${w.h1} y ${w.estilos_repetidos})`);
    // El Word es de ESTE libro (y no del último que se armó).
    ok(w.titulo.includes(L.TITULO) && texto.includes(junto(L.DEDICATORIA.join(""))), `${L.SLUG}: el Word adaptado no es de este libro`);
    L.CAPITULOS.forEach((c) => {
      ok(w.titulos2.some((t) => t.includes(c.titulo)), `${L.SLUG}: en el Word adaptado, el capítulo «${c.titulo}» no va con el estilo Título 2`);
      ok(texto.includes(junto(c.escena.alt)), `${L.SLUG}: el Word adaptado no cuenta el dibujo del capítulo ${c.n}`);
    });
    ok(w.imagenes > 0 && w.decorativas === w.imagenes, `${L.SLUG}: en el Word adaptado hay ${w.imagenes} imágenes y ${w.decorativas} marcadas como decorativas: tienen que ser todas`);
    ok(w.exactos === 0 && w.sin_regla === 0, `${L.SLUG}: el Word adaptado tiene interlineados que no son automáticos: LibreOffice recorta las imágenes y encima los títulos`);
    ok(w.listas > 0, `${L.SLUG}: el Word adaptado no tiene listas de verdad (con su numeración)`);
    ok(texto.includes(junto("Soluciones")), `${L.SLUG}: el Word adaptado no trae las soluciones`);
  }
} else {
  fallos.push(`falta material/${L.SLUG}/${L.SLUG}-adaptado.docx: hay que correr herramientas/libro-ninos-pdf.js --solo-adaptado`);
}

// El EPUB adaptado. Lo validan EPUBCheck y Ace by DAISY (a mano: piden Java y
// un Chromium); acá se comprueba sin ellos lo que se rompe callado: el
// mimetype primero y sin comprimir (si no, el lector no lo reconoce como
// EPUB), el idioma, los metadatos de accesibilidad, el índice, que cada
// página sea XML bien formado con su idioma, que cada imagen tenga su alt y
// que el libro sea ESTE (con sus capítulos, sus dibujos contados y el «Con
// las manos»).
const epub = path.join(CARPETA, L.SLUG + "-adaptado.epub");
if (fs.existsSync(epub)) {
  const guionE = `
import sys, json, re, zipfile
import xml.etree.ElementTree as ET
z = zipfile.ZipFile(sys.argv[1])
primero = z.infolist()[0]
opf = z.read("EPUB/package.opf").decode("utf-8")
paginas, malas, sin_idioma, imgs, sin_alt, texto = [], [], [], 0, 0, []
for n in z.namelist():
    if not n.endswith(".xhtml"): continue
    x = z.read(n).decode("utf-8")
    try:
        raiz = ET.fromstring(x.encode("utf-8"))
    except ET.ParseError as e:
        malas.append(n + ": " + str(e)); continue
    if 'lang="es-CR"' not in x: sin_idioma.append(n)
    for im in raiz.iter("{http://www.w3.org/1999/xhtml}img"):
        imgs += 1
        if im.get("alt") is None: sin_alt += 1
    if n != "EPUB/nav.xhtml": texto.append("".join(raiz.itertext()))
    paginas.append(n)
print(json.dumps({
  "mimetype": primero.filename == "mimetype" and primero.compress_type == zipfile.ZIP_STORED and z.read("mimetype") == b"application/epub+zip",
  "idioma": "<dc:language>es-CR</dc:language>" in opf,
  "titulo": (re.search(r"<dc:title>(.*?)</dc:title>", opf) or [None, ""])[1],
  "a11y": [p for p in ["schema:accessMode", "schema:accessModeSufficient", "schema:accessibilityFeature", "schema:accessibilityHazard", "schema:accessibilitySummary", "dcterms:conformsTo"] if 'property="' + p + '"' not in opf],
  "nav": 'properties="nav"' in opf and "EPUB/nav.xhtml" in z.namelist(),
  "paginas": len(paginas), "malas": malas, "sin_idioma": sin_idioma, "imgs": imgs, "sin_alt": sin_alt,
  "texto": " ".join(texto),
}))`;
  let ep = null;
  try {
    ep = JSON.parse(require("child_process").execFileSync("python3", ["-c", guionE, epub], { maxBuffer: 64 * 1024 * 1024 }));
  } catch (e) {
    fallos.push(`${L.SLUG}: no se pudo leer el EPUB adaptado`);
  }
  if (ep) {
    const junto = (t) => String(t).replace(/\s+/g, "");
    const texto = junto(ep.texto);
    ok(ep.mimetype, `${L.SLUG}: el EPUB no empieza con su mimetype sin comprimir: un lector no lo reconoce como libro`);
    ok(ep.idioma, `${L.SLUG}: el EPUB no dice que está en español (Costa Rica)`);
    ok(ep.titulo.includes(L.TITULO) && texto.includes(junto(L.DEDICATORIA.join(""))), `${L.SLUG}: el EPUB no es de este libro`);
    ok(!ep.a11y.length, `${L.SLUG}: al EPUB le faltan metadatos de accesibilidad: ${ep.a11y.join(", ")}`);
    ok(ep.nav, `${L.SLUG}: el EPUB no tiene índice (nav)`);
    ok(!ep.malas.length, `${L.SLUG}: páginas del EPUB que no son XML bien formado: ${ep.malas.join("; ")}`);
    ok(!ep.sin_idioma.length, `${L.SLUG}: páginas del EPUB sin idioma: ${ep.sin_idioma.join(", ")}`);
    ok(ep.imgs > 0 && ep.sin_alt === 0, `${L.SLUG}: en el EPUB hay ${ep.sin_alt} imágenes sin alt`);
    L.CAPITULOS.forEach((c) => {
      ok(texto.includes(junto(c.titulo)), `${L.SLUG}: el EPUB no tiene el capítulo «${c.titulo}»`);
      ok(texto.includes(junto(c.escena.alt)), `${L.SLUG}: el EPUB no cuenta el dibujo del capítulo ${c.n}`);
    });
    ok(texto.includes(junto("Con las manos.")) && texto.includes(junto("Para leer con las manos")), `${L.SLUG}: el EPUB no trae los ejercicios para hacer con las manos`);
  }
} else {
  fallos.push(`falta material/${L.SLUG}/${L.SLUG}-adaptado.epub: hay que correr herramientas/libro-ninos-pdf.js --solo-adaptado`);
}

// El guion del audiolibro (herramientas/libro-ninos/guion/). Quién dice cada
// diálogo sale del inciso o de HABLA en voces.js; lo que se rompe callado es
// una clave de HABLA que ya no está en el cuento (se corrigió el párrafo: la
// línea iría a quien no es), una voz sin describir, o el guion viejo después
// de cambiar el cuento.
const VOCES = require("./libro-ninos/voces.js");
const guion = path.join(__dirname, "libro-ninos", "guion", L.SLUG + ".json");
if (fs.existsSync(guion)) {
  const g = JSON.parse(fs.readFileSync(guion, "utf8"));
  const parrafos = [...L.PRESENTACION.parrafos, ...L.CAPITULOS.flatMap((c) => c.cuento), ...L.FINAL];
  Object.keys((VOCES.LIBROS[L.SLUG] || {}).habla || {}).forEach((k) => {
    const n = parrafos.filter((t) => t.startsWith(k)).length;
    ok(n === 1, `${L.SLUG}: en HABLA de voces.js, «${k}» empieza ${n} párrafos del cuento (tiene que ser uno): ¿se corrigió el párrafo?`);
  });
  const voces = new Set(g.pistas.flatMap((p) => p.segmentos.map((s) => s.voz)));
  [...voces].forEach((v) => ok(VOCES.PERSONAJES[v], `${L.SLUG}: el guion usa la voz «${v}», que no está en PERSONAJES de voces.js`));
  ok(voces.size > 2, `${L.SLUG}: el guion tiene una sola voz: los personajes no hablan`);
  // Cada párrafo del cuento está en el guion (sin rayas ni espacios: el guion
  // separa lo que dice cada uno).
  const letras = (t) => t.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
  const todo = letras(g.pistas.flatMap((p) => p.segmentos.map((s) => s.texto)).join(""));
  const faltan = parrafos.filter((t) => !todo.includes(letras(t)));
  ok(!faltan.length, `${L.SLUG}: al guion le faltan ${faltan.length} párrafos del cuento (¿se cambió el cuento sin volver a correr libro-ninos-pdf.js?): «${(faltan[0] || "").slice(0, 50)}…»`);
  L.CAPITULOS.forEach((c) => ok(g.pistas.some((p) => p.titulo === `Capítulo ${c.n}. ${c.titulo}`), `${L.SLUG}: el guion no tiene la pista del capítulo ${c.n}`));
  ok(g.pistas.some((p) => p.segmentos.some((s) => s.piensa)), `${L.SLUG}: el guion no deja pausas para que el niño conteste`);
} else {
  fallos.push(`falta herramientas/libro-ninos/guion/${L.SLUG}.json: hay que correr herramientas/libro-ninos-pdf.js --solo-accesible`);
}
}

LIBROS.forEach(verificarLibro);

// Los guiones por voz (herramientas/audiolibro-grabar.js): lo que se le da a
// cada persona que graba. Si el guion cambió y el Word no, la persona graba
// líneas viejas o con el número corrido, y nadie lo nota hasta armar el audio.
{
  const G = require("./audiolibro-grabar.js");
  let guiones = null;
  try { guiones = G.leerGuiones(); } catch (e) { /* ya avisó cada libro */ }
  if (guiones) {
    const voces = G.vocesUsadas(guiones);
    const docs = [...voces.map((v) => path.join(G.SALIDA, G.slugVoz(v) + ".docx")), path.join(G.SALIDA, "cesion-de-voz.docx")];
    const faltan = docs.filter((f) => !fs.existsSync(f));
    ok(!faltan.length, `faltan los guiones por voz (${faltan.map((f) => path.basename(f)).join(", ")}): hay que correr herramientas/audiolibro-grabar.js`);
    if (!faltan.length) {
      const leer = `
import sys, json, zipfile, re, html
print(json.dumps([html.unescape(re.sub(r"<[^>]+>", " ", zipfile.ZipFile(f).read("word/document.xml").decode("utf-8"))) for f in sys.argv[1:]]))`;
      const textos = JSON.parse(require("child_process").execFileSync("python3", ["-c", leer, ...docs], { maxBuffer: 64 * 1024 * 1024 }));
      const letras = (t) => t.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
      voces.forEach((v, i) => {
        const doc = letras(textos[i]);
        const pistas = G.lineasDe(guiones, v).flatMap((l) => l.pistas);
        const viejas = pistas.flatMap((x) => x.lineas.filter((y) => !doc.includes(letras(`${y.n}. ${y.texto}`))));
        ok(!viejas.length, `${G.slugVoz(v)}.docx: le faltan ${viejas.length} líneas del guion o tienen otro número (¿se cambió el guion sin volver a correr audiolibro-grabar.js?): «${viejas.length ? viejas[0].texto.slice(0, 50) : ""}…»`);
        ok(pistas.every((x) => doc.includes(letras(x.archivo))), `${G.slugVoz(v)}.docx: no dice el nombre de archivo de cada pista`);
      });
      ok(textos[voces.length].includes("persona menor") && textos[voces.length].includes("Ley 8968"), "cesion-de-voz.docx no trae la parte de la persona menor o la de datos personales");
    }
  }
}
// Los diplomas se coleccionan: el n.º de cada uno es su lugar en libros.js y
// cada medalla es distinta.
LIBROS.forEach((l, i) => ok(l.DIPLOMA.numero === i + 1, `${l.SLUG}: su diploma dice n.º ${l.DIPLOMA.numero} y es el libro ${i + 1} de la colección`));
ok(new Set(LIBROS.map((l) => l.DIPLOMA.medalla)).size === LIBROS.length, "dos diplomas tienen la misma medalla");
ok(new Set(LIBROS.map((l) => l.SLUG)).size === LIBROS.length, "dos libros tienen el mismo slug");

if (fallos.length) {
  console.error(`✗ ${fallos.length} fallo(s):\n  - ` + fallos.join("\n  - "));
  process.exit(1);
}
console.log(`✓ Los cuentos de Peonita: ${LIBROS.map((l) => `${l.SLUG} (${l.CAPITULOS.length} capítulos, ${l.CAPITULOS.reduce((s, c) => s + c.ejercicios.length, 0)} ejercicios)`).join(", ")}; ${comprobadas} posiciones comprobadas con chess.js.`);
