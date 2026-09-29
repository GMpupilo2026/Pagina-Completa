/* Preparación de rivales: qué táctica hace y con cuál pierde.
 *
 * En cada partida se busca EL MOMENTO DECISIVO: la primera vez que un bando
 * pierde material (2 puntos o más) y no lo recupera. El material se mide solo
 * en posiciones tranquilas (la jugada siguiente no es una captura ni una
 * coronación), así un cambio de piezas a medio hacer no cuenta como pérdida.
 * Después se miran las jugadas del bando que ganó ese material, en las
 * últimas antes de cobrarlo, y se reconoce el patrón:
 *
 *   jaque doble, descubierta, horquilla (doble ataque), clavada, enfilada,
 *   eliminación del defensor, coronación; si ninguno: pieza sin defender
 *   (la dejó colgada) u otra.
 *
 * Las partidas que terminan en mate sin haber perdido material antes son
 * «mate del pasillo» o «ataque de mate».
 *
 * En sus VICTORIAS, el tema es lo que él hace (sus armas); en sus DERROTAS,
 * lo que le hicieron (sus puntos ciegos). No usa motor: es un conteo por
 * patrón sobre partidas reales, rápido aunque sean miles, para ver
 * tendencias; cada tema trae partidas de ejemplo para verlo en el tablero.
 * Ver «Los temas tácticos del rival» en docs/decisiones/paneles.md.
 *
 *   analizar(lista, maximo) → { revisadas, realiza, sufre, sinMaterial }
 *     lista: las partidas del rival como las arma partidasDelRival()
 *   momento(jugadas, perdedor, terminoEnMate, fen) → { tema, ply, hasta } o
 *     null; `fen` para empezar en otra posición (las pruebas)
 *   TEMAS: nombre y tema de entrenamiento (entreno/temas.html) de cada uno
 *
 * Corre en js/preparacion-trabajador.js (y en Node, en el verificador).
 */
(function (raiz, fabrica) {
  "use strict";
  const req = (nombre, global) => (raiz && raiz[global]) || (typeof require === "function" ? require(nombre) : null);
  const api = fabrica(req("./preparacion-posiciones.js", "PreparacionPosiciones"));
  if (typeof module === "object" && module.exports) module.exports = api;
  else raiz.PreparacionTactica = api;
})(typeof self !== "undefined" ? self : this, function (Pos) {
  "use strict";

  // Cada tema: su nombre y el tema de entreno/temas.html para practicarlo.
  // `plural`: como se dice en una frase («cuidado con sus horquillas»).
  const TEMAS = {
    "mate-pasillo": { nombre: "Mate del pasillo", plural: "mates del pasillo", practica: "backRankMate" },
    "mate": { nombre: "Ataque de mate", plural: "ataques de mate", practica: "mate" },
    "jaque-doble": { nombre: "Jaque doble", plural: "jaques dobles", practica: "doubleCheck" },
    "descubierta": { nombre: "Ataque a la descubierta", plural: "ataques a la descubierta", practica: "discoveredAttack" },
    "horquilla": { nombre: "Horquilla (ataque doble)", plural: "horquillas", practica: "fork" },
    "clavada": { nombre: "Clavada", plural: "clavadas", practica: "pin" },
    "enfilada": { nombre: "Enfilada", plural: "enfiladas", practica: "skewer" },
    "defensor": { nombre: "Eliminación del defensor", plural: "eliminaciones del defensor", practica: "capturingDefender" },
    "coronacion": { nombre: "Coronación", plural: "coronaciones", practica: "promotion" },
    "colgada": { nombre: "Pieza sin defender", plural: "piezas sin defender", practica: "hangingPiece" },
    "otra": { nombre: "Otra (no se reconoce el patrón)", plural: "otras tácticas", practica: null },
  };

  const VALOR = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  const valor = (p) => VALOR[p.toLowerCase()];
  const colorDe = (p) => (p === p.toUpperCase() ? "w" : "b");
  const DIFERENCIA = 2;           // puntos de material que deciden
  const HACIA_ATRAS = 3;          // jugadas del ganador que se miran antes de cobrar
  const MAX_EJEMPLOS = 2;

  const SALTOS = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
  const REY = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const RECTAS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const DIAGONALES = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const dentro = (c, f) => c >= 0 && c < 8 && f >= 0 && f < 8;

  function direcciones(p) {
    const t = p.toLowerCase();
    return t === "r" ? RECTAS : t === "b" ? DIAGONALES : t === "q" ? RECTAS.concat(DIAGONALES) : null;
  }

  // Las casillas que ataca la pieza de la casilla s (los deslizadores, hasta la
  // primera pieza, incluida).
  function ataques(t, s) {
    const p = t[s];
    if (!p) return [];
    const col = s & 7, fil = s >> 3, out = [];
    const tipo = p.toLowerCase();
    if (tipo === "p") {
      const df = colorDe(p) === "w" ? 1 : -1;
      for (const dc of [-1, 1]) if (dentro(col + dc, fil + df)) out.push((fil + df) * 8 + col + dc);
      return out;
    }
    if (tipo === "n" || tipo === "k") {
      for (const [dc, df] of tipo === "n" ? SALTOS : REY) if (dentro(col + dc, fil + df)) out.push((fil + df) * 8 + col + dc);
      return out;
    }
    for (const [dc, df] of direcciones(p)) {
      let c = col + dc, f = fil + df;
      while (dentro(c, f)) {
        out.push(f * 8 + c);
        if (t[f * 8 + c]) break;
        c += dc; f += df;
      }
    }
    return out;
  }

  function atacantes(t, casilla, color) {
    const out = [];
    for (let s = 0; s < 64; s++) if (t[s] && colorDe(t[s]) === color && ataques(t, s).includes(casilla)) out.push(s);
    return out;
  }

  function material(t) {
    let m = 0;
    for (const p of t) if (p) m += (colorDe(p) === "w" ? 1 : -1) * valor(p);
    return m;
  }

  // Lo que hizo una jugada: de dónde a dónde (el enroque no interesa acá).
  function movida(antes, despues, color) {
    let desde = -1, hasta = -1;
    for (let s = 0; s < 64; s++) {
      if (antes[s] === despues[s]) continue;
      if (antes[s] && colorDe(antes[s]) === color && !despues[s]) desde = s;
      else if (despues[s] && colorDe(despues[s]) === color) hasta = s;
    }
    return desde >= 0 && hasta >= 0 ? { desde, hasta } : null;
  }

  // Lo que hay detrás de la primera pieza en una línea: [primera, segunda].
  function enLinea(t, s, dc, df) {
    const col = s & 7, fil = s >> 3, vistas = [];
    let c = col + dc, f = fil + df;
    while (dentro(c, f) && vistas.length < 2) {
      if (t[f * 8 + c]) vistas.push(f * 8 + c);
      c += dc; f += df;
    }
    return vistas;
  }

  const defendida = (t, s) => atacantes(t, s, colorDe(t[s])).length > 0;

  /* El patrón de la jugada del ganador que llevó de `antes` a `despues`:
     { tema, blancos } o null. `blancos`: las piezas (letras) que el patrón
     ataca; el tema solo cuenta si después se cobra una de ellas (así una
     clavada sin importancia no se lleva el crédito de otra cosa).
     `siguiente`: el tablero después de la jugada siguiente del ganador (para
     la eliminación del defensor). */
  function patron(antes, despues, ganador, siguiente) {
    const perdedor = ganador === "w" ? "b" : "w";
    const m = movida(antes, despues, ganador);
    if (!m) return null;
    const pieza = despues[m.hasta];
    const rey = despues.indexOf(perdedor === "w" ? "K" : "k");
    const valiosa = (s) => despues[s] && colorDe(despues[s]) === perdedor && (s === rey || valor(despues[s]) >= 3);

    const daJaque = rey >= 0 ? atacantes(despues, rey, ganador) : [];
    if (daJaque.length >= 2) return { tema: "jaque-doble", blancos: null };
    const letras = (xs) => xs.filter((x) => x !== rey).map((x) => despues[x]);

    // Descubierta: otra pieza suya, cuya línea pasaba por la casilla de
    // salida, ahora ataca algo que vale.
    for (let s = 0; s < 64; s++) {
      if (s === m.hasta || !despues[s] || colorDe(despues[s]) !== ganador || !direcciones(despues[s])) continue;
      const nuevas = ataques(despues, s).filter((x) => valiosa(x) && !ataques(antes, s).includes(x))
        .filter((x) => x === rey || valor(despues[x]) > valor(despues[s]) || !defendida(despues, x));
      if (nuevas.length) {
        // Con jaque a la descubierta, lo que se cobra es lo que ataca la pieza que movió.
        const otros = ataques(despues, m.hasta).filter((x) => despues[x] && colorDe(despues[x]) === perdedor);
        return { tema: "descubierta", blancos: letras(nuevas).concat(nuevas.includes(rey) ? letras(otros) : []) };
      }
    }

    // Horquilla: la pieza que movió ataca dos cosas que valen más que ella o
    // que no están defendidas (o el rey y otra).
    const blancos = ataques(despues, m.hasta).filter((x) => despues[x] && colorDe(despues[x]) === perdedor &&
      (x === rey || valor(despues[x]) > valor(pieza) || (valor(despues[x]) >= 3 && !defendida(despues, x))));
    if (blancos.length >= 2) return { tema: "horquilla", blancos: letras(blancos) };

    // Clavada y enfilada: en cada línea de la pieza que movió, la primera
    // pieza contraria y la de atrás.
    const dirs = direcciones(pieza);
    if (dirs) {
      for (const [dc, df] of dirs) {
        const [a, b] = enLinea(despues, m.hasta, dc, df);
        if (a === undefined || b === undefined) continue;
        if (colorDe(despues[a]) !== perdedor || colorDe(despues[b]) !== perdedor) continue;
        const va = a === rey ? 100 : valor(despues[a]), vb = b === rey ? 100 : valor(despues[b]);
        if (vb > va && va >= 1) return { tema: "clavada", blancos: letras([a, b]) };
        if (va > vb && vb >= 3) return { tema: "enfilada", blancos: letras([b]) };
      }
    }

    // Eliminación del defensor: comió la pieza que defendía otra, y la cobra
    // en la jugada siguiente.
    const comio = antes[m.hasta] && colorDe(antes[m.hasta]) === perdedor;
    if (comio && siguiente) {
      for (let s = 0; s < 64; s++) {
        if (s === m.hasta || !antes[s] || colorDe(antes[s]) !== perdedor || valor(antes[s]) < 3) continue;
        const defensores = atacantes(antes, s, perdedor);
        if (defensores.length === 1 && defensores[0] === m.hasta && despues[s] === antes[s] && siguiente[s] && colorDe(siguiente[s]) === ganador) return { tema: "defensor", blancos: [antes[s]] };
      }
    }
    return null;
  }

  // El mate: del pasillo si el rey quedó en su primera fila, encerrado por sus
  // propias piezas, y el jaque vino por esa fila.
  function tipoDeMate(t, perdedor) {
    const rey = t.indexOf(perdedor === "w" ? "K" : "k");
    if (rey < 0) return "mate";
    const fila = rey >> 3, primera = perdedor === "w" ? 0 : 7;
    const ganador = perdedor === "w" ? "b" : "w";
    const jaques = atacantes(t, rey, ganador);
    if (fila === primera && jaques.some((s) => (s >> 3) === fila && /[rq]/i.test(t[s]))) {
      const adelante = perdedor === "w" ? 1 : -1, col = rey & 7;
      const tapadas = [-1, 0, 1].filter((dc) => dentro(col + dc, fila + adelante)).every((dc) => {
        const p = t[(fila + adelante) * 8 + col + dc];
        return p && colorDe(p) === perdedor;
      });
      if (tapadas) return "mate-pasillo";
    }
    return "mate";
  }

  /* El momento decisivo de una partida para el bando `perdedor` ("w"/"b"):
     { tema, ply (la jugada del patrón, contada desde 1), hasta (la jugada
     donde se cobra) } o null si nunca perdió material de forma decisiva ni
     recibió mate. */
  function momento(jugadas, perdedor, terminoEnMate, fen) {
    const ganador = perdedor === "w" ? "b" : "w";
    const tableros = [];
    let e = fen ? Pos.desdeFen(fen) : Pos.inicial();
    const primero = e.turno;
    tableros.push(e.t);
    for (const san of jugadas) {
      e = Pos.aplicar(e, san);
      if (!e) break;
      tableros.push(e.t);
    }
    const n = tableros.length - 1;
    const signo = perdedor === "w" ? 1 : -1;
    // Las posiciones tranquilas: la jugada siguiente no captura ni corona.
    const tranquilas = [];
    for (let i = 0; i <= n; i++) {
      const sig = jugadas[i];
      if (i === n || !sig || (sig.indexOf("x") < 0 && sig.indexOf("=") < 0)) tranquilas.push({ i, v: signo * material(tableros[i]) });
    }
    for (let k = 1; k < tranquilas.length; k++) {
      const antes = tranquilas[k - 1], ahora = tranquilas[k];
      if (ahora.v > antes.v - DIFERENCIA) continue;
      // ¿La recupera después? Entonces no fue decisiva.
      const recupera = tranquilas.slice(k + 1).some((x) => x.v > antes.v - DIFERENCIA + 0.5);
      if (recupera) continue;
      const hasta = ahora.i;
      // Las jugadas del ganador desde unas antes del cambio hasta que cobra,
      // de la primera a la última: la primera con patrón es el tema.
      const desde = Math.max(1, antes.i - 2 * HACIA_ATRAS + 1);
      for (let p = desde; p <= hasta; p++) {
        const mueveGanador = ((p - 1) % 2 === 0) === (ganador === primero);
        if (!mueveGanador) continue;
        const sig = p + 2 <= n ? tableros[p + 2] : null;
        const pa = patron(tableros[p - 1], tableros[p], ganador, sig);
        if (!pa) continue;
        // Lo que el ganador cobró después de esa jugada, hasta `hasta`.
        const cobradas = [];
        for (let q = p + 1; q <= hasta; q++) {
          const mq = movida(tableros[q - 1], tableros[q], ganador);
          const c = mq && tableros[q - 1][mq.hasta];
          if (c && colorDe(c) === perdedor) cobradas.push(c);
        }
        if (!pa.blancos || pa.blancos.some((b) => cobradas.includes(b))) return { tema: pa.tema, ply: p, hasta };
      }
      // Una coronación en el camino.
      for (let p = antes.i + 1; p <= hasta; p++) if (/=/.test(jugadas[p - 1] || "")) return { tema: "coronacion", ply: p, hasta };
      // Sin patrón: ¿se comió una pieza que estaba sin defender (o atacada por
      // una de menos valor)? La dejó colgada.
      for (let p = antes.i + 1; p <= hasta; p++) {
        const mueveGanador = ((p - 1) % 2 === 0) === (ganador === primero);
        if (!mueveGanador) continue;
        const m = movida(tableros[p - 1], tableros[p], ganador);
        if (!m) continue;
        const comida = tableros[p - 1][m.hasta];
        if (!comida || colorDe(comida) !== perdedor || valor(comida) < 3) continue;
        const sinDefensa = atacantes(tableros[p - 1], m.hasta, perdedor).length === 0;
        if (sinDefensa || valor(comida) > valor(tableros[p][m.hasta])) return { tema: "colgada", ply: p, hasta };
      }
      return { tema: "otra", ply: hasta, hasta };
    }
    if (terminoEnMate && n > 0) return { tema: tipoDeMate(tableros[n], perdedor), ply: n, hasta: n };
    return null;
  }

  const MAX_PARTIDAS = 2000;     // las más recientes: con 30.000 no hace falta mirar todas

  function analizar(lista, maximo) {
    const recientes = lista.filter((x) => x.res === "G" || x.res === "P")
      .slice().sort((a, b) => ((a.fecha || "") < (b.fecha || "") ? 1 : (a.fecha || "") > (b.fecha || "") ? -1 : 0))
      .slice(0, maximo || MAX_PARTIDAS);
    const juntar = () => new Map();
    const realiza = juntar(), sufre = juntar();
    const revisadas = { ganadas: 0, perdidas: 0 };
    const sinMaterial = { ganadas: 0, perdidas: 0 };
    for (const x of recientes) {
      const gano = x.res === "G";
      const perdedor = gano ? (x.color === "w" ? "b" : "w") : x.color;
      const mo = momento(x.jugadas, perdedor, x.fin === "mate");
      if (gano) revisadas.ganadas += 1; else revisadas.perdidas += 1;
      if (!mo) { if (gano) sinMaterial.ganadas += 1; else sinMaterial.perdidas += 1; continue; }
      const mapa = gano ? realiza : sufre;
      if (!mapa.has(mo.tema)) mapa.set(mo.tema, { tema: mo.tema, n: 0, ejemplos: [] });
      const t = mapa.get(mo.tema);
      t.n += 1;
      if (t.ejemplos.length < MAX_EJEMPLOS) {
        const ej = { sec: x.jugadas.slice(0, mo.hasta), ply: mo.ply, color: x.color };
        if (x.enlace) ej.enlace = x.enlace;
        if (x.fecha) ej.fecha = x.fecha;
        if (x.oponente) ej.oponente = String(x.oponente).slice(0, 60);
        t.ejemplos.push(ej);
      }
    }
    const orden = (m, total) => [...m.values()].map((t) => Object.assign(t, { parte: t.n / Math.max(total, 1) })).sort((a, b) => b.n - a.n || (a.tema < b.tema ? -1 : 1));
    return {
      revisadas,
      sinMaterial,
      realiza: orden(realiza, revisadas.ganadas - sinMaterial.ganadas),
      sufre: orden(sufre, revisadas.perdidas - sinMaterial.perdidas),
    };
  }

  return { analizar, momento, TEMAS };
});
