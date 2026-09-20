/* Comprueba el banco de fichas de estudio (js/fichas-estudio.js).
 *
 * Lo que se rompe acá no da ningún error en pantalla: una FEN mal escrita
 * dibuja un tablero cualquiera, una jugada que no existe deja el diagrama
 * congelado en la posición anterior y un lineaId que no está en el banco de
 * aperturas deja el botón de practicar apuntando a la nada. La ficha se sigue
 * viendo perfecta en los tres casos.
 *
 * Uso:  npm install chess.js@0.10.3
 *       node herramientas/verificar-fichas.js
 */
const path = require("path");
const { FICHAS, TITULOS, CATEGORIAS } = require(path.join(__dirname, "..", "js", "fichas-estudio.js"));
const { LINEAS } = require(path.join(__dirname, "..", "js", "aperturas-lineas.js"));

let CJS;
try { CJS = require("chess.js"); } catch (e) {
  console.error("Falta chess.js. Instálalo con:  npm install chess.js@0.10.3");
  process.exit(2);
}
const Chess = CJS.Chess || CJS;

let fallos = 0;
const mal = (m) => { console.log("  ✗ " + m); fallos += 1; };
const bien = (m) => console.log("  ✓ " + m);

const PIEZAS = ["p", "n", "b", "r", "q", "k"];
const normal = (t) => String(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const CATS = CATEGORIAS.map((c) => c.id);
const PorId = new Map(LINEAS.map((L) => [L.id, L]));

console.log("=== Estructura de cada ficha ===");
const vistos = new Set();
FICHAS.forEach((F) => {
  const q = (m) => mal(`[${F.id || "(sin id)"}] ${m}`);
  if (!F.id || !/^[a-z0-9-]+$/.test(F.id)) q("el id tiene que ser minúsculas, números y guiones");
  if (vistos.has(F.id)) q("id repetido: el enlace ?ficha= llevaría siempre a la primera");
  vistos.add(F.id);
  if (!CATS.includes(F.categoria)) q(`categoría desconocida: ${F.categoria}`);
  if (!F.titulo || !F.subtitulo || !F.resumen || !F.diagrama) q("le falta título, subtítulo, resumen o el pie del diagrama");
  if (![1, 2, 3].includes(F.nivel)) q("el nivel va de 1 a 3");
  if (!PIEZAS.includes(F.pieza)) q(`la pieza del centro no existe: ${F.pieza}`);

  // Cinco bloques SIEMPRE y en el mismo lugar: es lo que hace que dos fichas
  // distintas se lean igual. Cuatro alrededor más el del centro.
  if (!Array.isArray(F.centro) || F.centro.length < 2 || F.centro.length > 4) q("el bloque del centro lleva de 2 a 4 renglones");
  if (!Array.isArray(F.bloques) || F.bloques.length !== 4) q("tienen que ser exactamente cuatro bloques alrededor");
  (F.bloques || []).forEach((b, i) => {
    if (!Array.isArray(b) || b.length < 2 || b.length > 5) q(`el bloque «${(TITULOS[F.categoria] || [])[i + 1]}» lleva de 2 a 5 renglones`);
    (b || []).forEach((r) => { if (typeof r !== "string" || !r.trim()) q("hay un renglón vacío"); });
  });
  (F.centro || []).forEach((r) => { if (typeof r !== "string" || !r.trim()) q("hay un renglón vacío en el centro"); });

  // Una sola fuente para la posición, nunca dos: si no, no se sabe cuál gana.
  const fuentes = ["lineaId", "jugadas", "fen"].filter((k) => F[k]);
  if (fuentes.length !== 1) q(`la posición sale de una sola fuente (lineaId, jugadas o fen); trae ${fuentes.length}`);
  if (F.linea && !F.fen) q("`linea` son las jugadas desde una `fen`: sin fen no significa nada");
});
if (!fallos) bien(`las ${FICHAS.length} fichas tienen su estructura completa`);

console.log("\n=== Las posiciones, comprobadas con chess.js ===");
// Las jugadas de las fichas de apertura y defensa NO se copian acá: se leen de
// js/aperturas-lineas.js, que es donde viven. Lo que hay que comprobar es que
// el id exista — un id mal escrito deja la ficha sin tablero y sin decir nada.
FICHAS.filter((F) => F.lineaId).forEach((F) => {
  if (!PorId.has(F.lineaId)) mal(`[${F.id}] lineaId «${F.lineaId}» no está en js/aperturas-lineas.js`);
});

function posicionDe(F) {
  if (F.fen) return { fen: F.fen, jugadas: F.linea || [] };
  const jugadas = F.jugadas || PorId.get(F.lineaId).jugadas;
  return { fen: null, jugadas };
}

FICHAS.forEach((F) => {
  const q = (m) => mal(`[${F.id}] ${m}`);
  const { fen, jugadas } = posicionDe(F);
  let g;
  if (fen) {
    g = new Chess();
    if (!g.load(fen)) { q(`la FEN no carga: ${fen}`); return; }
    const v = g.validate_fen(fen);
    if (!v.valid) { q(`FEN inválida: ${v.error}`); return; }
    // Una posición donde el bando que NO mueve está en jaque no se puede dar
    // nunca en una partida: chess.js la carga igual y el tablero se ve bien.
    const otro = new Chess(fen.replace(/ (w|b) /, (m, c) => ` ${c === "w" ? "b" : "w"} `));
    if (otro.in_check()) { q("posición imposible: el bando que no mueve está en jaque"); return; }
    if (!/k/.test(fen.split(" ")[0]) || !/K/.test(fen.split(" ")[0])) { q("falta un rey"); return; }
  } else {
    g = new Chess();
  }
  let ultima = null;
  for (const san of jugadas) {
    const hecha = g.move(san, { sloppy: true });
    if (!hecha) { q(`la jugada ${san} no existe en su posición`); return; }
    ultima = { san, hecha };
  }
  // El mate prometido tiene que ser mate de verdad: una línea que termina en #
  // sin mate es una ficha que enseña mal, y no da ningún error.
  if (ultima && /#$/.test(ultima.san) && !g.in_checkmate()) q(`la línea promete mate con ${ultima.san} y no es mate`);
  if (ultima && /\+$/.test(ultima.san) && !g.in_check() && !g.in_checkmate()) q(`${ultima.san} dice jaque y no da jaque`);
  if (!ultima && !fen) q("se quedó sin jugadas y sin fen: no hay posición que dibujar");
});
if (!fallos) bien("todas las posiciones cargan, son legales y sus jugadas existen");

console.log("\n=== Lo que la ficha promete, comprobado con el motor ===");
/* Una ficha que dice "horquilla" tiene que enseñar una horquilla de verdad, y
   eso no se mira a ojo: se juega. Cada ficha declara en `comprueba` qué hay que
   cumplir y acá se cumple o falla. Es el mismo criterio del material de los
   cursos —el resultado se verifica con motor— y del banco del diagnóstico, que
   dice en `prueba` qué se le comprobó a cada posición.

   El más fuerte de todos es ganaSiempre: no alcanza con que la pieza ATAQUE dos
   cosas, hay que ver que el rival no tenga NINGUNA respuesta que salve la que
   se promete. Una horquilla que el rival para con una jugada no es una
   horquilla, y en el diagrama se ve igual de bien. */
const COMPRUEBAN = {
  // La jugada de la ficha da jaque de verdad.
  jaque(F, g0) {
    const g = new Chess(g0.fen());
    g.move(F.linea[0], { sloppy: true });
    return g.in_check() || g.in_checkmate() ? null : `${F.linea[0]} no da jaque`;
  },
  // Después de la jugada, el rival NO tiene ninguna respuesta legal que impida
  // comer en esa casilla.
  ganaSiempre(F, g0, casilla) {
    const base = new Chess(g0.fen());
    const m = base.move(F.linea[0], { sloppy: true });
    const respuestas = base.moves({ verbose: true });
    if (!respuestas.length) return `después de ${F.linea[0]} el rival no tiene jugadas: esto es mate, no una táctica`;
    const salvan = respuestas.filter((r) => {
      const g = new Chess(base.fen());
      g.move(r.san, { sloppy: true });
      return !g.moves({ verbose: true }).some((x) => x.to === casilla && x.flags.includes("c"));
    });
    return salvan.length
      ? `${salvan.length} de ${respuestas.length} respuestas salvan ${casilla} (por ejemplo ${salvan[0].san})`
      : (m ? null : "la jugada no existe");
  },
  // La línea entera termina en mate.
  mateFinal(F, g0) {
    const g = new Chess(g0.fen());
    F.linea.forEach((san) => g.move(san, { sloppy: true }));
    return g.in_checkmate() ? null : "la línea no termina en mate";
  },
  // La pieza de esa casilla está clavada: no tiene NINGUNA jugada legal.
  clavadaEn(F, g0, casilla) {
    const pieza = g0.get(casilla);
    if (!pieza) return `no hay ninguna pieza en ${casilla}`;
    const fen = g0.fen().split(" ");
    fen[1] = pieza.color; fen[3] = "-";
    const g = new Chess(fen.join(" "));
    const n = g.moves({ square: casilla }).length;
    return n === 0 ? null : `la pieza de ${casilla} tiene ${n} jugadas: no está clavada`;
  },
  // Peón pasado: ningún peón rival delante ni en las columnas de al lado.
  pasado(F, g0, casilla) {
    const pieza = g0.get(casilla);
    if (!pieza || pieza.type !== "p") return `en ${casilla} no hay un peón`;
    const col = casilla.charCodeAt(0) - 97, fila = +casilla[1];
    const rival = pieza.color === "w" ? "b" : "w";
    for (let c = Math.max(0, col - 1); c <= Math.min(7, col + 1); c++) {
      for (let f = 1; f <= 8; f++) {
        const delante = pieza.color === "w" ? f > fila : f < fila;
        const p = g0.get(String.fromCharCode(97 + c) + f);
        if (delante && p && p.type === "p" && p.color === rival) return `el peón de ${casilla} no está pasado: hay un peón rival en ${String.fromCharCode(97 + c) + f}`;
      }
    }
    return null;
  },
  // Columna abierta: sin un solo peón, de ninguno de los dos.
  columnaAbierta(F, g0, col) {
    for (let f = 1; f <= 8; f++) {
      const p = g0.get(col + f);
      if (p && p.type === "p") return `la columna ${col} tiene un peón en ${col + f}: no está abierta`;
    }
    return null;
  },
  // Casilla fuerte: ningún peón rival puede llegar nunca a atacarla, o sea que
  // no queda ni uno en las dos columnas de al lado.
  casillaFuerte(F, g0, casilla) {
    const pieza = g0.get(casilla);
    if (!pieza) return `no hay ninguna pieza en ${casilla}`;
    const rival = pieza.color === "w" ? "b" : "w";
    const col = casilla.charCodeAt(0) - 97, fila = +casilla[1];
    for (const c of [col - 1, col + 1]) {
      if (c < 0 || c > 7) continue;
      for (let f = 1; f <= 8; f++) {
        const p = g0.get(String.fromCharCode(97 + c) + f);
        const puedeLlegar = pieza.color === "w" ? f > fila : f < fila;
        if (p && p.type === "p" && p.color === rival && puedeLlegar) return `${casilla} no es casilla fuerte: el peón de ${String.fromCharCode(97 + c) + f} la puede atacar`;
      }
    }
    return null;
  },
  // El par de alfiles, de verdad: dos, de distinto color de casilla, y el rival
  // sin los dos.
  parDeAlfiles(F, g0, color) {
    const mios = [], suyos = [];
    g0.SQUARES.forEach((sq) => {
      const p = g0.get(sq);
      if (p && p.type === "b") (p.color === color ? mios : suyos).push(sq);
    });
    const claro = (sq) => ((sq.charCodeAt(0) - 97) + (+sq[1] - 1)) % 2 === 1;
    if (mios.length !== 2) return `tiene ${mios.length} alfil(es), no dos`;
    if (claro(mios[0]) === claro(mios[1])) return "los dos alfiles son del mismo color de casilla: eso no es el par";
    if (suyos.length >= 2) return "el rival también tiene los dos: no hay ventaja que enseñar";
    return null;
  },
  // Rey activo: dentro del cuadrado central c3-f6, o sea fuera de su rincón.
  reyCentral(F, g0, color) {
    let donde = null;
    g0.SQUARES.forEach((sq) => { const p = g0.get(sq); if (p && p.type === "k" && p.color === color) donde = sq; });
    const col = donde.charCodeAt(0) - 97, fila = +donde[1];
    return (col >= 2 && col <= 5 && fila >= 3 && fila <= 6) ? null : `el rey está en ${donde}: eso no es un rey activo`;
  },
  // Peones doblados: dos o más del mismo color en la misma columna.
  doblados(F, g0, opt) {
    let n = 0;
    for (let f = 1; f <= 8; f++) {
      const p = g0.get(opt.columna + f);
      if (p && p.type === "p" && p.color === opt.color) n += 1;
    }
    return n >= 2 ? null : `en la columna ${opt.columna} hay ${n} peón(es): no están doblados`;
  },
  // Los dos reyes enrocados, que es de lo que habla la ficha.
  enrocados(F, g0) {
    const b = g0.get("g1"), n = g0.get("g8");
    return (b && b.type === "k" && n && n.type === "k") ? null : "los dos reyes tendrían que estar enrocados corto";
  },
};

FICHAS.filter((F) => F.comprueba).forEach((F) => {
  const { fen, jugadas } = posicionDe(F);
  const g0 = new Chess();
  if (fen) g0.load(fen); else jugadas.forEach((san) => g0.move(san, { sloppy: true }));
  Object.keys(F.comprueba).forEach((clave) => {
    const fn = COMPRUEBAN[clave];
    if (!fn) { mal(`[${F.id}] comprobación desconocida: ${clave}`); return; }
    const problema = fn(F, g0, F.comprueba[clave]);
    if (problema) mal(`[${F.id}] ${clave}: ${problema}`);
    else bien(`[${F.id}] ${clave}`);
  });
});

console.log("\n=== Los temas que la ficha manda a buscar existen ===");
/* Cuando una ficha dice «el tema X», ese X tiene que existir en Ejercicios por
   tema. Mandar a un alumno a un tema que no está no da ningún error: lo busca
   en la lista, no lo encuentra y se queda pensando que se equivocó él. Los
   nombres salen del mismo entreno/data/temas.json que arma esa página, no de
   una lista copiada acá. Las demás « » son comillas normales. */
const TEMAS = (() => {
  const d = require(path.join(__dirname, "..", "entreno", "data", "temas.json"));
  const grupos = Array.isArray(d.groups) ? d.groups : Object.values(d.groups || {});
  const nombres = new Set();
  grupos.forEach((g) => (g.themes || []).forEach((t) => nombres.add(normal(t.name))));
  return nombres;
})();
let citados = 0;
FICHAS.forEach((F) => {
  const texto = [F.resumen, F.diagrama].concat(F.centro, ...F.bloques).join(" | ");
  (texto.match(/\btemas? «[^»]+»/g) || []).forEach((cita) => {
    citados += 1;
    const nombre = cita.slice(cita.indexOf("«") + 1, -1);
    if (!TEMAS.has(normal(nombre))) mal(`[${F.id}] manda al tema «${nombre}», que no está en entreno/data/temas.json`);
  });
});
bien(`los ${citados} temas que nombran las fichas existen en Ejercicios por tema`);

console.log("\n=== Las cuatro pestañas ===");
CATEGORIAS.forEach((c) => {
  const n = FICHAS.filter((F) => F.categoria === c.id).length;
  if (n < 4) mal(`la pestaña «${c.etiqueta}» tiene ${n} ficha(s): con menos de cuatro no vale la pena la pestaña`);
  else bien(`${c.etiqueta}: ${n} fichas`);
  if (!TITULOS[c.id] || TITULOS[c.id].length !== 5) mal(`«${c.etiqueta}» no tiene sus cinco títulos de bloque`);
});

console.log(fallos ? `\n✗ ${fallos} problema(s).` : `\n✓ Todo bien: ${FICHAS.length} fichas.`);
process.exit(fallos ? 1 : 0);
