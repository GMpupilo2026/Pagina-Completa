/* ===== El banco del libro «Los tipos de mate» =====
 *
 * Arma material/tipos-de-mate/banco.json, el banco del libro para imprimir de
 * los entrenadores Oscar Angulo Cubero y Sebastian Mora Chavarria: una figura
 * de mate por capítulo, con su explicación, su diagrama modelo y 24 ejercicios
 * (12 de mate en 1 y 12 de mate en 2), que caben en dos hojas. Si de un tipo
 * no alcanzan (el pasillo casi no tiene mates en 1 que pasen), se completa con
 * el otro. Lo leen herramientas/tipos-de-mate-pdf.js y
 * herramientas/verificar-tipos-de-mate.js. Elegir es determinista: sale igual
 * en cada corrida mientras no cambien sus fuentes.
 *
 * De dónde sale cada cosa —ninguna posición se inventa—:
 *   - Los ejercicios, de entreno/data/temas.json: los ejercicios de Lichess
 *     (CC0) que la plataforma ya tiene agrupados por figura de mate, con el
 *     tema que les puso Lichess (backRankMate, smotheredMate…).
 *   - La explicación y el diagrama modelo, de la ficha de Estudio de esa
 *     figura (js/fichas-estudio.js), que ya está comprobada por
 *     verificar-fichas.js. Tres figuras no tienen ficha (el recuadro, el
 *     triángulo y Vuković): su texto va acá abajo y su modelo es el mate final
 *     de un ejercicio de Lichess de esa figura, que después no se usa como
 *     ejercicio (sería regalar la solución).
 *
 * Nada se cree a ciegas. Cada ejercicio se comprueba con chess.js por fuerza
 * bruta, que en mate en 1 y en 2 alcanza sin motor:
 *   - mate en 1: UNA sola jugada da mate. Un ejercicio con dos soluciones en
 *     papel se corrige mal: el alumno da la otra y se la ponen mala.
 *   - mate en 2: no hay mate en 1, UNA sola primera jugada fuerza el mate en
 *     2, y contra CADA respuesta del rival hay mate (no solo contra la de la
 *     línea de Lichess). La línea de la solución se juega entera y termina en
 *     mate.
 * Lichess solo garantiza su línea; esto garantiza el ejercicio.
 *
 * Qué ejercicios: de cada figura, los que pasan el filtro se ordenan por
 * rating de Lichess y se toman de puntos repartidos (los cuartos, si son cuatro), para
 * que cada capítulo vaya de fácil a difícil. Un ejercicio que Lichess puso en
 * dos figuras se usa una sola vez.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { Chess } = require("chess.js");

const RAIZ = path.join(__dirname, "..");
const TEMAS = JSON.parse(fs.readFileSync(path.join(RAIZ, "entreno/data/temas.json"), "utf8"));
global.window = global.window || {};
require(path.join(RAIZ, "js/fichas-estudio.js"));
const FICHAS = global.window.FichasEstudio.FICHAS;

/* Cuántos de cada tipo por figura. Hubo una edición con 4 y 4 en tableros
   grandes; se pidió una sola, la de dos hojas por tema. */
const EDICION = { archivo: "banco.json", mateIn1: 12, mateIn2: 12 };

/* El orden del libro: de los mates que más se ven a los que piden juntar más
   piezas. No sale del rating: el mate del pasillo es el primero que hay que
   saber aunque sus ejercicios de Lichess no sean los más fáciles. */
const ORDEN = [
  "backRankMate", "smotheredMate", "epauletteMate", "dovetailMate", "doubleBishopMate",
  "bodenMate", "arabianMate", "cornerMate", "anastasiaMate", "hookMate", "blindSwineMate",
  "operaMate", "morphysMate", "pillsburysMate", "balestraMate", "swallowstailMate",
  "triangleMate", "killBoxMate", "vukovicMate",
];

/* Las tres figuras sin ficha de Estudio. Los cuatro bloques en el mismo orden
   que las fichas: cuándo aparece, cómo se da, errores frecuentes, cómo
   practicarlo. */
const PROPIAS = {
  triangleMate: {
    titulo: "El mate del triángulo",
    subtitulo: "Dama y torre en la misma línea",
    resumen: "La dama da mate pegada al rey y la torre, en su misma columna o fila y una casilla más allá, la sostiene: dama, torre y rey forman un triángulo.",
    centro: [
      "La dama da el jaque pegada al rey",
      "La torre la defiende desde la misma columna o fila, con una casilla en medio",
      "El rey no puede comer a la dama ni escaparse por la línea de la torre",
    ],
    bloques: [
      ["Rey rival con la columna o la fila de al lado abierta", "Una torre ya metida en esa línea", "La dama que puede llegar delante de la torre"],
      ["Dama y torre, siempre juntas en la misma línea", "La torre suele llegar primero, con jaque o amenaza", "Muchas veces la dama entra comiendo un peón del enroque"],
      ["Dejar que una torre rival se meta en la séptima o en la columna del rey", "Mover el peón que tapaba esa línea", "Defender la casilla del mate con una sola pieza que se puede desviar"],
      ["Cuando una torre tuya llegue cerca del rey, mirar dónde cabe la dama", "Comparar con el mate del recuadro: allá la dama sostiene a la torre", "En Entrenamiento, el tema «Mate del triángulo» de Ejercicios por tema"],
    ],
  },
  killBoxMate: {
    titulo: "El mate del recuadro",
    subtitulo: "Torre pegada al rey y dama que la sostiene",
    resumen: "La torre da jaque pegada al rey y la dama, en diagonal detrás de ella, la defiende y cierra las salidas: el rey queda en una caja de 3 por 3.",
    centro: [
      "La torre da el jaque pegada al rey",
      "La dama la defiende en diagonal, desde atrás",
      "Entre las dos cubren todo el recuadro de 3 por 3 alrededor del rey",
    ],
    bloques: [
      ["Rey rival en la orilla o detrás de sus peones", "Una columna o una fila abierta hasta el rey", "La dama ya cerca, en diagonal con la casilla del jaque"],
      ["Torre y dama juntas: la torre adelante, la dama de escolta", "La torre suele entrar comiendo una pieza que defendía", "Es la forma más común de rematar un ataque con dama y torre"],
      ["Contar solo los atacantes de la casilla y no las salidas del rey", "Dejar la diagonal de la dama rival abierta hacia el rey", "Cambiar la torre que defendía la última fila"],
      ["Antes de dar jaque con la torre, mirar si la dama la sostiene", "Comparar con el mate del triángulo: allá la torre sostiene a la dama", "En Entrenamiento, el tema «Mate del recuadro mortal» de Ejercicios por tema"],
    ],
  },
  vukovicMate: {
    titulo: "El mate de Vuković",
    subtitulo: "Torre y caballo en la orilla",
    resumen: "La torre da mate pegada al rey, defendida por una tercera pieza (un peón, el rey…), y el caballo le quita al rey las casillas de escape.",
    centro: [
      "La torre da el jaque pegada al rey, en la orilla",
      "Otra pieza defiende a la torre: el rey no la puede comer",
      "El caballo cubre las casillas por donde el rey se escaparía",
    ],
    bloques: [
      ["Rey rival en la orilla, con pocas piezas cerca", "Un caballo propio a un salto del rey", "Un peón o el rey propio que puede sostener a la torre"],
      ["Torre y caballo, más una tercera pieza que defiende a la torre", "Aparece mucho en los finales, con los reyes activos", "Se llama así por Vladimir Vuković, que escribió sobre el ataque al rey"],
      ["Llevar el rey a la orilla en el final sin mirar al caballo rival", "No ver que un peón sostiene a la torre", "Dejar el caballo rival cerca del rey sin cambiarlo"],
      ["Con torre y caballo, buscar dónde el caballo encierra al rey", "Comparar con el mate árabe: ahí la torre la defiende el caballo", "En Entrenamiento, el tema «Mate de Vukovic» de Ejercicios por tema"],
    ],
  },
};

/* ---------------------------------------------------------- comprobar */
function jugadas(g) { return g.moves({ verbose: true }); }
function aplicar(g, m) { return g.move({ from: m.from, to: m.to, promotion: m.promotion }); }

/* Las jugadas que dan mate en el acto. */
function mates1(fen) {
  const g = new Chess(fen);
  return jugadas(g).filter((m) => { aplicar(g, m); const s = g.in_checkmate(); g.undo(); return s; }).map((m) => m.san);
}

/* ¿Hay alguna jugada que dé mate? Se corta en la primera: es lo que más se
   repite, y chess.js no es rápido. */
function hayMate1(g) {
  return jugadas(g).some((m) => { aplicar(g, m); const s = g.in_checkmate(); g.undo(); return s; });
}

/* Las primeras jugadas que fuerzan mate en 2 (sin contar las que dan mate en 1). */
function fuerzanMate2(fen) {
  const g = new Chess(fen);
  const buenas = [];
  for (const m of jugadas(g)) {
    aplicar(g, m);
    if (!g.in_checkmate() && !g.game_over()) {
      const respuestas = jugadas(g);
      const todas = respuestas.every((r) => { aplicar(g, r); const hay = hayMate1(g); g.undo(); return hay; });
      if (todas) buenas.push(m.san);
    }
    g.undo();
  }
  return buenas;
}

/* Juega la línea en inglés (SAN de chess.js); devuelve la FEN final o lanza. */
function jugarLinea(fen, linea) {
  const g = new Chess(fen);
  linea.forEach((san) => { if (!g.move(san)) throw new Error(`${san} no es legal en ${g.fen()}`); });
  return g;
}

/* Lo que se exige a un ejercicio. Devuelve null si está bien, o el porqué. */
function revisar(ej) {
  let g;
  try { g = jugarLinea(ej.fen, ej.solucion); } catch (e) { return e.message; }
  if (!g.in_checkmate()) return "la línea no termina en mate";
  const en1 = mates1(ej.fen);
  if (ej.tipo === "mateIn1") {
    if (ej.solucion.length !== 1) return "un mate en 1 con más de una jugada";
    if (en1.length !== 1) return `${en1.length} jugadas dan mate`;
    return null;
  }
  if (ej.solucion.length !== 3) return "un mate en 2 sin tres jugadas";
  if (en1.length) return "tiene mate en 1";
  const en2 = fuerzanMate2(ej.fen);
  if (en2.length !== 1 || en2[0] !== ej.solucion[0]) return `fuerzan el mate en 2: ${en2.join(", ") || "ninguna"}`;
  return null;
}

/* ---------------------------------------------------------- armar */
function casillaDelRey(g) {
  const turno = g.turn();
  const tab = g.board();
  for (let f = 0; f < 8; f++) for (let c = 0; c < 8; c++) {
    const p = tab[f][c];
    if (p && p.type === "k" && p.color === turno) return "abcdefgh"[c] + (8 - f);
  }
  return null;
}

/* El modelo: la posición del mate, con la pieza que lo da y el rey marcados. */
function modelo(fen, linea) {
  const g = new Chess(fen);
  let ultima = null;
  linea.forEach((san) => { ultima = g.move(san); });
  if (!g.in_checkmate()) throw new Error("el modelo no es mate: " + fen);
  return { fen: g.fen(), destacar: [ultima.to, casillaDelRey(g)], jugada: ultima.san, previo: fen, linea };
}

function cuartos(lista, n) {
  if (lista.length <= n) return lista.slice();
  const salida = [];
  for (let i = 0; i < n; i++) salida.push(lista[Math.floor(((2 * i + 1) * lista.length) / (2 * n))]);
  return salida;
}

// Cada ejercicio se comprueba una vez aunque se mire dos veces.
const revisado = new Map();
function pasa(p, tipo) {
  const k = p.id + "|" + tipo;
  if (!revisado.has(k)) revisado.set(k, !revisar({ fen: p.fen, solucion: p.solution, tipo }));
  return revisado.get(k);
}

function armar(edicion = EDICION) {
  const nombres = Object.fromEntries(TEMAS.groups.flatMap((g) => g.themes).map((t) => [t.key, t]));
  const usados = new Set();
  const capitulos = ORDEN.map((clave, i) => {
    const ficha = FICHAS.find((f) => f.categoria === "mate" && f.temaPractica === clave);
    const texto = ficha || PROPIAS[clave];
    if (!texto) throw new Error("La figura " + clave + " no tiene ni ficha ni texto propio.");
    const todos = TEMAS.themes[clave].map((id) => Object.assign({ id }, TEMAS.puzzles[id]));

    let mod;
    if (ficha) {
      mod = modelo(ficha.fen, ficha.linea);
    } else {
      // El mate en 1 más fácil que pase el filtro; después no es ejercicio.
      const base = todos.filter((p) => p.themes.includes("mateIn1")).sort((a, b) => a.rating - b.rating || (a.id < b.id ? -1 : 1))
        .find((p) => !revisar({ fen: p.fen, solucion: p.solution, tipo: "mateIn1" }));
      mod = modelo(base.fen, base.solution);
      mod.lichess = base.id;
      usados.add(base.id);
    }

    /* Si de un tipo no alcanzan (el pasillo casi no tiene mates en 1 que
       pasen: casi siempre hay dos torres que dan mate; la coz, al revés, casi
       no tiene mates en 2), se completa con el otro. */
    const buenos = {};
    for (const tipo of ["mateIn1", "mateIn2"]) {
      buenos[tipo] = todos
        .filter((p) => p.themes.includes(tipo) && !usados.has(p.id))
        .sort((a, b) => a.rating - b.rating || (a.id < b.id ? -1 : 1))
        .filter((p) => pasa(p, tipo));
    }
    const total = edicion.mateIn1 + edicion.mateIn2;
    const n1 = Math.min(buenos.mateIn1.length, edicion.mateIn1 + Math.max(0, edicion.mateIn2 - buenos.mateIn2.length));
    const n2 = total - n1;
    if (n2 > buenos.mateIn2.length) throw new Error(`${clave}: no alcanzan los ejercicios`);
    const ejercicios = [];
    [["mateIn1", n1], ["mateIn2", n2]].forEach(([tipo, n]) => cuartos(buenos[tipo], n).forEach((p) => {
      usados.add(p.id);
      ejercicios.push({ id: p.id, fen: p.fen, solucion: p.solution, tipo, rating: p.rating, juegan: p.fen.split(" ")[1], partida: p.game });
    }));
    return {
      n: i + 1, clave, lichess: nombres[clave] ? nombres[clave].name : clave,
      titulo: texto.titulo, subtitulo: texto.subtitulo, resumen: texto.resumen,
      centro: texto.centro, bloques: texto.bloques, ficha: ficha ? ficha.id : null,
      diagrama: ficha ? ficha.diagrama : null,
      modelo: mod, ejercicios,
    };
  });
  let n = 0;
  capitulos.forEach((c) => c.ejercicios.forEach((e) => { e.n = ++n; e.capitulo = c.n; }));
  return capitulos;
}

module.exports = { armar, revisar, mates1, fuerzanMate2, ORDEN, EDICION };

/* Corrido directo, escribe la selección en material/tipos-de-mate/banco.json,
   que es lo que leen el PDF y el verificador (elegir tarda un par de minutos:
   la fuerza bruta de los mates en 2 con chess.js). No se edita a mano.

       node herramientas/tipos-de-mate-banco.js */
if (require.main === module) {
  const capitulos = armar();
  const destino = path.join(RAIZ, "material", "tipos-de-mate", EDICION.archivo);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, JSON.stringify({ capitulos }, null, 1) + "\n");
  console.log(`${capitulos.length} capítulos · ${capitulos.reduce((s, c) => s + c.ejercicios.length, 0)} ejercicios → ${destino}`);
}
