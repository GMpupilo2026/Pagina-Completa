/* Las reglas de los Tipos de entrenamiento 8 a 14, sin DOM: el Barrido,
 * Intercambios, Constrúyela tú, la Ruta segura y Rey y peón. (Adivina la jugada
 * del maestro y ¿Qué apertura es? no necesitan reglas propias: se corrigen
 * comparando jugadas o nombres.)
 *
 * Mismo contrato que js/tipos-reglas.js, del que usa las utilidades: lo cargan
 * la página, la clase en vivo y los verificadores en Node, y todo lo que pide
 * chess.js lo recibe como parámetro. Las definiciones de acá SON las del
 * ejercicio: el generador arma los bancos con estas mismas funciones y el
 * verificador las vuelve a correr, así que la respuesta que corrige la página
 * no puede separarse de la que se comprobó.
 */
(function (raiz) {
  "use strict";
  const R = typeof module !== "undefined" && module.exports ? require("./tipos-reglas.js") : raiz.TiposReglas;
  const VALOR = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
  const otro = R.otro;

  function conTurno(fen, turno) {
    const p = fen.split(" ");
    return [p[0], turno, p[2] || "-", "-", p[4] || "0", p[5] || "1"].join(" ");
  }
  function cargar(Chess, fen) { const g = new Chess(); return g.load(fen) ? g : null; }

  /* Casillas que ATACA un bando (no cuenta avances de peón), sobre un tablero
     de 64 (R.tablero). `sin` es una casilla que se hace de cuenta que está
     vacía (la pieza que se va a mover no tapa nada). */
  const DIRS = { r: [[1, 0], [-1, 0], [0, 1], [0, -1]], b: [[1, 1], [1, -1], [-1, 1], [-1, -1]] };
  DIRS.q = DIRS.r.concat(DIRS.b);
  const SALTOS = { n: [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]],
    k: [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] };
  function atacadas(tab, color, sin) {
    const out = new Set();
    const ocup = (i) => i !== sin && !!tab[i];
    tab.forEach((p, i) => {
      if (!p || p.c !== color || i === sin) return;
      const f = i & 7, r = i >> 3;
      const en = (df, dr) => { const nf = f + df, nr = r + dr; return nf >= 0 && nf < 8 && nr >= 0 && nr < 8 ? nr * 8 + nf : -1; };
      if (p.t === "p") {
        const d = color === "w" ? 1 : -1;
        [-1, 1].forEach((df) => { const j = en(df, d); if (j >= 0) out.add(j); });
      } else if (p.t === "n" || p.t === "k") {
        SALTOS[p.t].forEach(([df, dr]) => { const j = en(df, dr); if (j >= 0) out.add(j); });
      } else {
        DIRS[p.t].forEach(([df, dr]) => {
          let k = 1, j;
          while ((j = en(df * k, dr * k)) >= 0) { out.add(j); if (ocup(j)) break; k++; }
        });
      }
    });
    return out;
  }

  /* Qué piezas de `color` atacan DIRECTO la casilla i (sin saltar nada). */
  function atacantes(tab, color, i) {
    const out = [];
    tab.forEach((p, j) => {
      if (!p || p.c !== color || j === i) return;
      const solo = tab.map((x, k) => (k === j ? x : (x && k !== i ? { t: "x", c: "x" } : null)));
      // un tablero con esa pieza y todo lo demás como obstáculo neutro
      if (atacadas(solo.map((x) => (x && x.t === "x" ? { t: "p", c: "z" } : x)), color).has(i)) out.push(j);
    });
    return out;
  }

  /* ===================================================================
   * El Barrido: todos los jaques, todas las capturas y todas las amenazas.
   *
   * Las tres clases no se pisan: un jaque que además captura es JAQUE; una
   * captura sin jaque es CAPTURA; y una AMENAZA es una jugada tranquila (sin
   * jaque ni captura) después de la cual el bando que movió ataca una pieza
   * rival —que no sea el rey— que antes no atacaba así: sin defensa, o de más
   * valor que la pieza que la ataca. Descubiertas incluidas.
   * =================================================================== */
  function amenazados(Chess, fen, color) {
    // casillas de piezas rivales amenazadas por `color` en esta posición
    const tab = R.tablero(fen);
    const suyas = atacadas(tab, color);
    const defendidas = atacadas(tab, otro(color));
    const out = new Set();
    // el valor del atacante más barato de cada casilla
    const g = cargar(Chess, conTurno(fen, color));
    if (!g) return out;
    const barato = {};
    g.moves({ verbose: true, legal: false }).forEach((m) => {
      if (!m.captured) return;
      const v = VALOR[m.piece];
      if (!(m.to in barato) || v < barato[m.to]) barato[m.to] = v;
    });
    tab.forEach((p, i) => {
      if (!p || p.c === color || p.t === "k" || !suyas.has(i)) return;
      const s = R.sq(i);
      if (!defendidas.has(i) || (barato[s] !== undefined && barato[s] < VALOR[p.t])) out.add(s);
    });
    return out;
  }
  function barrido(Chess, fen) {
    const g = new Chess(fen);
    const yo = g.turn();
    const antes = amenazados(Chess, fen, yo);
    const res = { jaques: [], capturas: [], amenazas: [] };
    g.moves({ verbose: true }).forEach((m) => {
      if (/[+#]/.test(m.san)) { res.jaques.push(m.san); return; }
      if (m.captured) { res.capturas.push(m.san); return; }
      g.move(m);
      const despues = amenazados(Chess, g.fen(), yo);
      g.undo();
      for (const s of despues) if (!antes.has(s)) { res.amenazas.push(m.san); return; }
    });
    return res;
  }
  function corregirBarrido(esperadas, dadas) {
    const set = new Set(esperadas), vistas = new Set();
    const bien = [], mal = [];
    dadas.forEach((s) => { if (vistas.has(s)) return; vistas.add(s); (set.has(s) ? bien : mal).push(s); });
    const faltan = esperadas.filter((s) => !vistas.has(s));
    let estrellas = 0;
    if (!faltan.length && !mal.length) estrellas = 3;
    else if (faltan.length <= 1 && !mal.length) estrellas = 2;
    else if (bien.length * 2 >= esperadas.length && mal.length <= 1) estrellas = 1;
    return { bien, mal, faltan, estrellas };
  }

  /* ===================================================================
   * Intercambios: la cadena de capturas en UNA casilla.
   *
   * Cada bando captura siempre con la pieza de menos valor que PUEDA capturar
   * legalmente (una pieza clavada no puede). La primera captura la hace quien
   * mueve; de ahí en adelante cada uno puede seguir o parar, y para cuando
   * seguir le cuesta. El resultado es lo que gana (o pierde) quien empezó, en
   * peones: 1 el peón, 3 caballo y alfil, 5 la torre, 9 la dama.
   * =================================================================== */
  function intercambio(Chess, fen, casilla) {
    const g = new Chess(fen);
    const inicio = g.turn();
    const tab0 = R.tablero(fen);
    const ic = R.idx(casilla);
    const objetivo = tab0[ic];
    if (!objetivo || objetivo.c === inicio) return null;
    // quién ataca de entrada la casilla (de los dos bandos): el que entra
    // después sin estar acá, entró por rayos X
    const iniciales = { w: new Set(atacantes(tab0, "w", ic)), b: new Set(atacantes(tab0, "b", ic)) };
    const pasos = [];
    let rayos = false, clavada = false, corona = false, alPaso = false;
    for (let n = 0; n < 32; n++) {
      const legales = g.moves({ verbose: true }).filter((m) => m.to === casilla && m.captured);
      // una pieza que ataca la casilla y no puede capturar: está clavada
      const tabN = R.tablero(g.fen());
      atacantes(tabN, g.turn(), ic).forEach((j) => {
        if (tabN[j].t !== "k" && !legales.some((l) => l.from === R.sq(j))) clavada = true;
      });
      if (!legales.length) break;
      legales.sort((a, b) => VALOR[a.piece] - VALOR[b.piece] || (a.from < b.from ? -1 : 1));
      const m = legales[0];
      if (m.promotion) corona = true;
      if (m.flags.includes("e")) alPaso = true;
      if (!iniciales[g.turn()].has(R.idx(m.from))) rayos = true;
      pasos.push({ san: m.san, pieza: m.piece, color: g.turn(), gana: VALOR[m.captured] });
      g.move(m);
    }
    if (!pasos.length) return null;
    // de atrás para adelante: cada uno sigue solo si le conviene
    const S = new Array(pasos.length);
    for (let i = pasos.length - 1; i >= 0; i--) S[i] = pasos[i].gana - (i + 1 < pasos.length ? Math.max(0, S[i + 1]) : 0);
    let hasta = 1;
    while (hasta < pasos.length && S[hasta] > 0) hasta++;
    return { valor: S[0], pasos, jugadas: pasos.slice(0, hasta).map((p) => p.san), rayos, clavada, corona, alPaso };
  }
  /* «las negras ganan 1 punto», «las blancas pierden 3 puntos», «queda igual». */
  function textoIntercambio(v, color) {
    if (v === 0) return "queda igual";
    const n = Math.abs(v);
    return "las " + R.COLOR[color] + (v > 0 ? " ganan " : " pierden ") + n + (n === 1 ? " punto" : " puntos");
  }

  /* ===================================================================
   * Constrúyela tú: poner UNA pieza para que pase algo.
   *
   *   mate-ya      la pieza puesta da jaque mate ahora mismo;
   *   horquilla    un caballo que ataca a la vez dos piezas grandes (rey, dama,
   *                torre, o una pieza menor sin defensa) y que no se puede comer;
   *   clavada      una pieza de largo alcance que clava una pieza rival contra
   *                su rey, sin dar jaque y sin que se la puedan comer;
   *   mate-en-1    después de ponerla, el bando que la puso tiene mate en 1;
   *   quitar-mate  una pieza del bando que se defiende, puesta para que el
   *                rival ya no tenga mate en 1.
   * Vale cualquier casilla que cumpla: se comprueba jugando, no contra una
   * lista.
   * =================================================================== */
  function tieneMateEn1(g) {
    return g.moves().some((m) => { g.move(m); const e = g.in_checkmate(); g.undo(); return e; });
  }
  function construye(Chess, item, casilla) {
    const tab = R.tablero(item.fen);
    const i = R.idx(casilla);
    if (!/^[a-h][1-8]$/.test(casilla)) return { ok: false, motivo: "Esa no es una casilla." };
    if (tab[i]) return { ok: false, motivo: "Esa casilla ya está ocupada." };
    const color = item.pieza[0], tipo = item.pieza[1];
    if (tipo === "p" && (casilla[1] === "1" || casilla[1] === "8")) return { ok: false, motivo: "Un peón no puede estar en la primera ni en la última fila." };
    const B = tab.slice(); B[i] = { t: tipo, c: color };
    if (!R.materialPosible(B, color)) return { ok: false, motivo: "Con esa pieza de más, ese bando tendría más material del posible." };
    const obj = item.objetivo;
    // quién mueve después de ponerla
    const turno = obj === "mate-en-1" ? color : otro(color);
    const g = cargar(Chess, R.colocacion(B) + " " + turno + " - - 0 1");
    if (!g) return { ok: false, motivo: "Esa posición no es válida." };
    // el que NO mueve no puede estar en jaque
    const gOtro = cargar(Chess, R.colocacion(B) + " " + otro(turno) + " - - 0 1");
    if (gOtro && gOtro.in_check()) return { ok: false, motivo: "Así el rey del bando que no mueve quedaría en jaque: esa posición no puede existir." };
    const puedenComerla = () => g.moves({ verbose: true }).some((m) => m.to === casilla && m.captured);
    if (obj === "mate-ya") {
      return g.in_checkmate() ? { ok: true } : { ok: false, motivo: g.in_check() ? "Da jaque, pero el rey tiene salida." : "Ahí no da jaque." };
    }
    if (obj === "horquilla") {
      if (puedenComerla()) return { ok: false, motivo: "Ahí te lo comen." };
      const defendidas = atacadas(B, otro(color));
      const ataca = atacadas(B.map((p, j) => (j === i ? p : (p && p.c === color ? null : p))), color);
      const blancos = [];
      B.forEach((p, j) => {
        if (!p || p.c === color || !ataca.has(j)) return;
        if (p.t === "k" || p.t === "q" || p.t === "r" || ((p.t === "b" || p.t === "n") && !defendidas.has(j))) blancos.push(R.sq(j));
      });
      return blancos.length >= 2 ? { ok: true, blancos } : { ok: false, motivo: blancos.length ? "Ataca solo a una pieza que valga la pena (" + blancos[0] + ")." : "Desde ahí no ataca nada que valga la pena." };
    }
    if (obj === "clavada") {
      if (g.in_check()) return { ok: false, motivo: "Eso es un jaque, no una clavada." };
      if (puedenComerla()) return { ok: false, motivo: "Ahí te la comen." };
      const dirs = DIRS[tipo] || [];
      const f = i & 7, r = i >> 3;
      for (const [df, dr] of dirs) {
        let k = 1, primera = -1;
        for (;;) {
          const nf = f + df * k, nr = r + dr * k;
          if (nf < 0 || nf > 7 || nr < 0 || nr > 7) break;
          const j = nr * 8 + nf, p = B[j];
          if (p) {
            if (primera < 0) { if (p.c === color || p.t === "k") break; primera = j; }
            else { if (p.c !== color && p.t === "k") return { ok: true, clavada: R.sq(primera) }; break; }
          }
          k++;
        }
      }
      return { ok: false, motivo: "No queda ninguna pieza rival clavada contra su rey." };
    }
    if (obj === "mate-en-1") {
      return tieneMateEn1(g) ? { ok: true } : { ok: false, motivo: "Con la pieza ahí todavía no hay mate en 1." };
    }
    if (obj === "quitar-mate") {
      if (g.in_check()) return { ok: false, motivo: "Así le das jaque al rey rival: hay que tapar el mate, no dar jaque." };
      return tieneMateEn1(g) ? { ok: false, motivo: "El rival sigue teniendo mate en 1." } : { ok: true };
    }
    return { ok: false, motivo: "Objetivo desconocido." };
  }
  function solucionesConstruye(Chess, item) {
    const out = [];
    for (let i = 0; i < 64; i++) if (construye(Chess, item, R.sq(i)).ok) out.push(R.sq(i));
    return out;
  }

  /* ===================================================================
   * La ruta segura: llevar UNA pieza a su destino en el menor número de
   * jugadas, sin capturar y sin pisar nunca una casilla que el rival ataque
   * (tampoco la de llegada). Las demás piezas no se mueven. Lo que el rival
   * ataca se cuenta sin la pieza que viaja: ella no tapa nada.
   * =================================================================== */
  function pasosDesde(tab, i, tipo, prohibidas) {
    const f = i & 7, r = i >> 3, out = [];
    const libre = (j) => !tab[j];
    const en = (df, dr) => { const nf = f + df, nr = r + dr; return nf >= 0 && nf < 8 && nr >= 0 && nr < 8 ? nr * 8 + nf : -1; };
    if (tipo === "n" || tipo === "k") {
      SALTOS[tipo].forEach(([df, dr]) => { const j = en(df, dr); if (j >= 0 && libre(j) && !prohibidas.has(j)) out.push(j); });
    } else {
      DIRS[tipo].forEach(([df, dr]) => {
        let k = 1, j;
        while ((j = en(df * k, dr * k)) >= 0 && libre(j)) { if (!prohibidas.has(j)) out.push(j); k++; }
      });
    }
    return out;
  }
  function rutaPrep(fen, desde) {
    const tab = R.tablero(fen);
    const i = R.idx(desde), p = tab[i];
    const sinElla = tab.slice(); sinElla[i] = null;
    const prohibidas = atacadas(sinElla, otro(p.c));
    return { tab: sinElla, tipo: p.t, prohibidas };
  }
  function rutaMinima(fen, desde, hasta) {
    const { tab, tipo, prohibidas } = rutaPrep(fen, desde);
    const ini = R.idx(desde), fin = R.idx(hasta);
    if (prohibidas.has(fin) || tab[fin]) return null;
    const prev = new Array(64).fill(-2); prev[ini] = -1;
    const cola = [ini];
    while (cola.length) {
      const a = cola.shift();
      if (a === fin) break;
      for (const b of pasosDesde(tab, a, tipo, prohibidas)) if (prev[b] === -2) { prev[b] = a; cola.push(b); }
    }
    if (prev[fin] === -2) return null;
    const camino = [];
    for (let x = fin; x !== ini; x = prev[x]) camino.unshift(R.sq(x));
    return { n: camino.length, camino };
  }
  function pasoValido(fen, desdeOriginal, actual, siguiente) {
    const { tab, tipo, prohibidas } = rutaPrep(fen, desdeOriginal);
    const j = R.idx(siguiente);
    if (tab[j]) return { ok: false, motivo: "Esa casilla está ocupada: la ruta no captura." };
    if (prohibidas.has(j)) return { ok: false, motivo: siguiente + " está atacada por el rival." };
    if (pasosDesde(tab, R.idx(actual), tipo, new Set()).indexOf(j) < 0) return { ok: false, motivo: "La pieza no llega de " + actual + " a " + siguiente + " en una jugada." };
    return { ok: true };
  }
  function estrellasRuta(n, minimo) { return n <= minimo ? 3 : n === minimo + 1 ? 2 : 1; }

  /* ===================================================================
   * Rey y peón contra rey. La tabla (quién gana con cada posición) la arma
   * herramientas/lib/kpk.js y viaja en entreno/data/kpk.json como bits: un bit
   * por posición, 1 = ganan las blancas. El peón es siempre blanco.
   * =================================================================== */
  function kpkIndice(wk, bk, p, turno) { return ((turno === "w" ? 0 : 1) * 64 * 64 * 64) + (wk * 64 + bk) * 64 + p; }
  function kpkDesdeFen(fen) {
    const tab = R.tablero(fen);
    let wk = -1, bk = -1, p = -1, otros = 0;
    tab.forEach((x, i) => {
      if (!x) return;
      if (x.t === "k") { if (x.c === "w") wk = i; else bk = i; }
      else if (x.t === "p" && x.c === "w") p = i;
      else otros++;
    });
    if (wk < 0 || bk < 0 || p < 0 || otros) return null;
    return { wk, bk, p, turno: fen.split(" ")[1] };
  }
  function kpkGana(bits, fen) {
    const d = kpkDesdeFen(fen);
    if (!d) return null;
    const k = kpkIndice(d.wk, d.bk, d.p, d.turno);
    return !!(bits[k >> 3] & (1 << (k & 7)));
  }
  function bitsDeBase64(b64) {
    if (typeof atob === "function") { const s = atob(b64); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
    return new Uint8Array(Buffer.from(b64, "base64"));
  }
  /* El rey negro, cuando ya está perdido, igual se defiende: se pone delante
     del peón (la casilla de coronar y su camino) y, si puede, se lo come. */
  function defensaKpk(Chess, bits, fen) {
    const g = new Chess(fen);
    const movs = g.moves({ verbose: true });
    if (!movs.length) return null;
    let mejor = null, mejorV = -Infinity;
    const d0 = kpkDesdeFen(fen);
    const pf = d0.p & 7;
    movs.forEach((m) => {
      g.move(m);
      let v;
      if (m.captured) v = 1000;
      else if (!kpkGana(bits, g.fen())) v = 500;                      // tablas: la elige
      else {
        const i = R.idx(m.to);
        v = -Math.max(Math.abs((i & 7) - pf), Math.abs((i >> 3) - 7));   // cerca de la casilla de coronar
      }
      g.undo();
      if (v > mejorV) { mejorV = v; mejor = m; }
    });
    return mejor;
  }

  const TiposReglasMas = {
    VALOR, atacadas, atacantes, amenazados, barrido, corregirBarrido,
    intercambio, textoIntercambio,
    construye, solucionesConstruye, tieneMateEn1,
    rutaMinima, pasoValido, estrellasRuta,
    kpkIndice, kpkDesdeFen, kpkGana, bitsDeBase64, defensaKpk,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = TiposReglasMas;
  else raiz.TiposReglasMas = TiposReglasMas;
})(typeof window !== "undefined" ? window : globalThis);
