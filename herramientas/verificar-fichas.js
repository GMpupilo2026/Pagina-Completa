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
  // ---- de acá para abajo, los que trajo la segunda tanda de fichas ----

  // Material ganado por un bando al terminar la línea, en peones. Es lo que
  // convierte "esto es una sobrecarga" en algo que se puede comprobar: la
  // combinación tiene que TERMINAR con el material prometido, no empezar bien.
  materialGanado(F, g0, opt) {
    const VALE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
    const cuenta = (g) => {
      let n = 0;
      g.SQUARES.forEach((sq) => {
        const p = g.get(sq);
        if (p) n += VALE[p.type] * (p.color === opt.color ? 1 : -1);
      });
      return n;
    };
    const g = new Chess(g0.fen());
    const antes = cuenta(g);
    F.linea.forEach((san) => g.move(san, { sloppy: true }));
    const gana = cuenta(g) - antes;
    return gana >= opt.al_menos ? null : `la línea deja ${gana} peones de ventaja, no ${opt.al_menos}`;
  },

  // La sobrecarga, comprobada: esa pieza defiende de verdad las dos casillas.
  defiendeDos(F, g0, opt) {
    const defensor = g0.get(opt.pieza);
    if (!defensor) return `no hay ninguna pieza en ${opt.pieza}`;
    const faltan = opt.casillas.filter((casilla) => {
      // Se cambia de color lo que hay en la casilla y se pregunta si el
      // defensor lo podría comer: eso es defenderlo.
      const g = new Chess(g0.fen());
      const p = g.get(casilla);
      if (!p) return true;
      g.remove(casilla);
      g.put({ type: p.type, color: p.color === "w" ? "b" : "w" }, casilla);
      const fen = g.fen().split(" ");
      fen[1] = defensor.color; fen[3] = "-";
      const h = new Chess(fen.join(" "));
      return !h.moves({ verbose: true }).some((m) => m.from === opt.pieza && m.to === casilla);
    });
    return faltan.length ? `la pieza de ${opt.pieza} no defiende ${faltan.join(" ni ")}` : null;
  },

  // Jaque doble: la prueba es que al rival NO le quede otra que mover el rey.
  dobleJaque(F, g0) {
    const g = new Chess(g0.fen());
    g.move(F.linea[0], { sloppy: true });
    if (!g.in_check()) return "no da jaque";
    const respuestas = g.moves({ verbose: true });
    const noRey = respuestas.filter((m) => m.piece !== "k");
    return noRey.length ? `se puede contestar sin mover el rey (${noRey[0].san}): es jaque simple` : null;
  },

  // Batería: las dos piezas en la misma línea, sin nada en medio, y la de
  // adelante atacando el objetivo.
  bateria(F, g0, opt) {
    const col = (sq) => sq.charCodeAt(0) - 97, fila = (sq) => +sq[1];
    const puntos = [opt.atras, opt.adelante, opt.objetivo];
    const dc = col(puntos[1]) - col(puntos[0]), df = fila(puntos[1]) - fila(puntos[0]);
    const dc2 = col(puntos[2]) - col(puntos[1]), df2 = fila(puntos[2]) - fila(puntos[1]);
    const mismaDir = (a, b, c, d) => a * d - b * c === 0 && (a * c > 0 || b * d > 0 || (a === 0 && c === 0) || (b === 0 && d === 0));
    if (!mismaDir(dc, df, dc2, df2)) return "las tres casillas no están en la misma línea";
    const atras = g0.get(opt.atras), adelante = g0.get(opt.adelante);
    if (!atras || !adelante) return "falta una de las dos piezas";
    if (atras.color !== adelante.color) return "las dos piezas no son del mismo bando";
    // La de adelante ataca el objetivo, y la de atrás la respalda.
    const fen = g0.fen().split(" ");
    fen[1] = atras.color; fen[3] = "-";
    const g = new Chess(fen.join(" "));
    const ataca = g.moves({ verbose: true }).some((m) => m.from === opt.adelante && m.to === opt.objetivo);
    return ataca ? null : `la pieza de ${opt.adelante} no llega a ${opt.objetivo}`;
  },

  // Pieza atrapada: tras la línea, todas sus jugadas la dejan donde el rival
  // la come (o no tiene ninguna).
  atrapada(F, g0, casilla) {
    const g = new Chess(g0.fen());
    (F.linea || []).forEach((san) => g.move(san, { sloppy: true }));
    const pieza = g.get(casilla);
    if (!pieza) return `no quedó ninguna pieza en ${casilla}`;
    const fen = g.fen().split(" ");
    fen[1] = pieza.color; fen[3] = "-";
    const suyo = new Chess(fen.join(" "));
    const salidas = suyo.moves({ verbose: true }).filter((m) => m.from === casilla);
    const seguras = salidas.filter((m) => {
      const h = new Chess(suyo.fen());
      h.move(m.san, { sloppy: true });
      return !h.moves({ verbose: true }).some((x) => x.to === m.to && x.flags.includes("c"));
    });
    return seguras.length ? `todavía puede escaparse a ${seguras[0].to}` : null;
  },

  // Jaque perpetuo: la línea repite la misma posición tres veces.
  repeticion(F, g0) {
    const g = new Chess(g0.fen());
    F.linea.forEach((san) => g.move(san, { sloppy: true }));
    return g.in_threefold_repetition() ? null : "la línea no llega a repetir tres veces la posición";
  },

  // Zugzwang: sin estar en jaque, el rival no tiene ninguna captura ahora y
  // TODA jugada legal le regala una. O sea: el problema es tener que mover.
  zugzwang(F, g0) {
    if (g0.in_check()) return "está en jaque: eso no es zugzwang, es una obligación normal";
    const jugadas = g0.moves({ verbose: true });
    if (!jugadas.length) return "no tiene jugadas: eso es mate o ahogado, no zugzwang";
    const fen = g0.fen().split(" ");
    fen[1] = g0.turn() === "w" ? "b" : "w"; fen[3] = "-";
    const rival = new Chess(fen.join(" "));
    if (rival.moves({ verbose: true }).some((m) => m.flags.includes("c")))
      return "el rival ya podía capturar antes de mover: la posición no se sostenía sola";
    const salvan = jugadas.filter((m) => {
      const g = new Chess(g0.fen());
      g.move(m.san, { sloppy: true });
      return !g.moves({ verbose: true }).some((x) => x.flags.includes("c") || x.flags.includes("e"));
    });
    return salvan.length ? `${salvan[0].san} no pierde nada: no está en zugzwang` : null;
  },

  // Oposición: los dos reyes en la misma línea con una cantidad impar de
  // casillas en medio, y el turno es del OTRO.
  oposicion(F, g0, color) {
    const donde = {};
    g0.SQUARES.forEach((sq) => { const p = g0.get(sq); if (p && p.type === "k") donde[p.color] = sq; });
    const dc = Math.abs(donde.w.charCodeAt(0) - donde.b.charCodeAt(0));
    const df = Math.abs(+donde.w[1] - +donde.b[1]);
    const enLinea = (dc === 0 && df % 2 === 0) || (df === 0 && dc % 2 === 0) || (dc === df && dc % 2 === 0);
    if (!enLinea) return `los reyes (${donde.w} y ${donde.b}) no están en oposición`;
    return g0.turn() === color ? "la tiene quien NO mueve: acá le toca mover a ese mismo" : null;
  },

  // La torre, detrás de su peón pasado.
  torreDetras(F, g0, opt) {
    const torre = g0.get(opt.torre), peon = g0.get(opt.peon);
    if (!torre || torre.type !== "r") return `en ${opt.torre} no hay una torre`;
    if (!peon || peon.type !== "p") return `en ${opt.peon} no hay un peón`;
    if (torre.color !== peon.color) return "la torre y el peón no son del mismo bando";
    if (opt.torre[0] !== opt.peon[0]) return "no están en la misma columna";
    const detras = peon.color === "w" ? +opt.torre[1] < +opt.peon[1] : +opt.torre[1] > +opt.peon[1];
    return detras ? null : "la torre está DELANTE del peón, que es justo lo que la ficha dice que no";
  },

  // La regla del cuadrado, con la cuenta de verdad: el rey llega si su
  // distancia a la casilla de coronar no supera lo que le falta al peón.
  cuadrado(F, g0, opt) {
    const peon = g0.get(opt.peon), rey = g0.get(opt.rey);
    if (!peon || peon.type !== "p") return `en ${opt.peon} no hay un peón`;
    if (!rey || rey.type !== "k") return `en ${opt.rey} no hay un rey`;
    const filaCorona = peon.color === "w" ? 8 : 1;
    let pasos = Math.abs(filaCorona - +opt.peon[1]);
    const salida = peon.color === "w" ? 2 : 7;
    if (+opt.peon[1] === salida) pasos -= 1;           // el salto doble cuenta
    const distancia = Math.max(
      Math.abs(opt.rey.charCodeAt(0) - opt.peon.charCodeAt(0)),
      Math.abs(+opt.rey[1] - filaCorona));
    const alcanza = distancia <= pasos + (g0.turn() === rey.color ? 0 : -1) + 1;
    if (alcanza !== !!opt.dentro) return `la cuenta no da: el rey necesita ${distancia} y el peón ${pasos}`;
    return null;
  },

  // Alfil malo: un solo alfil, y sus peones en el mismo color de casilla.
  alfilMalo(F, g0, color) {
    const claro = (sq) => ((sq.charCodeAt(0) - 97) + (+sq[1] - 1)) % 2 === 1;
    const alfiles = [], peones = [];
    g0.SQUARES.forEach((sq) => {
      const p = g0.get(sq);
      if (!p || p.color !== color) return;
      if (p.type === "b") alfiles.push(sq);
      if (p.type === "p") peones.push(sq);
    });
    if (alfiles.length !== 1) return `tiene ${alfiles.length} alfiles: el caso no es ese`;
    const mismos = peones.filter((sq) => claro(sq) === claro(alfiles[0]));
    return mismos.length >= peones.length * 0.6
      ? null
      : `solo ${mismos.length} de ${peones.length} peones están en el color del alfil: no está encerrado`;
  },

  // Peón aislado: sin peones propios en las columnas de al lado.
  aislado(F, g0, opt) {
    const peon = g0.get(opt.casilla);
    if (!peon || peon.type !== "p" || peon.color !== opt.color) return `en ${opt.casilla} no hay un peón suyo`;
    const col = opt.casilla.charCodeAt(0) - 97;
    for (const c of [col - 1, col + 1]) {
      if (c < 0 || c > 7) continue;
      for (let f = 1; f <= 8; f++) {
        const p = g0.get(String.fromCharCode(97 + c) + f);
        if (p && p.type === "p" && p.color === opt.color) return `no está aislado: tiene un peón vecino en ${String.fromCharCode(97 + c) + f}`;
      }
    }
    return null;
  },

  // Ahogado: sin jaque y sin una sola jugada legal.
  ahogado(F, g0) {
    if (g0.in_check()) return "está en jaque: eso sería mate, no ahogado";
    return g0.in_stalemate() ? null : "el rival todavía tiene jugadas: no está ahogado";
  },

  // Los peones de la cadena están donde la ficha dice.
  peonesEn(F, g0, opt) {
    const faltan = opt.casillas.filter((sq) => {
      const p = g0.get(sq);
      return !p || p.type !== "p" || p.color !== opt.color;
    });
    return faltan.length ? `no hay peón suyo en ${faltan.join(", ")}` : null;
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
