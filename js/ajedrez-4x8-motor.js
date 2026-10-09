/* ===== Ajedrez Integral — Ajedrez 4×8: las reglas y la computadora =====
 *
 * Medio tablero: cuatro columnas (a–d) y las ocho filas de siempre. Cada bando
 * tiene torre, rey, dama y caballo en su primera fila (a1 b1 c1 d1, y lo mismo
 * en la 8) y cuatro peones delante. Todo lo demás es ajedrez: el peón avanza
 * dos desde su fila, captura al paso y corona; mate, ahogado, triple
 * repetición, cincuenta jugadas y material insuficiente. No hay enroque: el
 * rey y la torre ya empiezan juntos.
 *
 * Sin DOM, para que el verificador lo cargue con `require` y lo compare con
 * chess.js (herramientas/verificar-ajedrez-4x8.js): en un tablero de 8×8 con
 * las columnas e–h vacías, las jugadas legales que no salen de a–d son
 * EXACTAMENTE las de este juego —una torre, un alfil o una dama que va de una
 * casilla de a–d a otra no pasa nunca por e–h, y sin piezas allá nadie da
 * jaque desde allá—. Así las reglas no se comprueban contra sí mismas.
 *
 * `Partida` se presenta como una partida de chess.js (get, moves, move, turn,
 * in_check, history, undo): con eso el teclado del tablero
 * (js/tablero-accesible.js), el recuadro de comandos (js/cuadro-comandos.js,
 * js/comandos-tablero.js), la coronación (js/coronacion.js) y la posición en
 * palabras (js/blind-notation.js) funcionan sin una línea propia. Las casillas
 * e–h contestan «vacía»: no existen, y nadie puede ir ahí.
 */
(function (raiz) {
  "use strict";

  var COLUMNAS = "abcd";
  var ANCHO = 4, ALTO = 8, N = ANCHO * ALTO;
  var PRIMERA = ["r", "k", "q", "n"];   // a, b, c, d
  var VALOR = { p: 100, n: 300, b: 310, r: 500, q: 900, k: 0 };
  var REY = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  var CABALLO = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
  var MATE = 100000;

  function nombre(i) { return COLUMNAS[i % ANCHO] + (Math.floor(i / ANCHO) + 1); }
  function indice(sq) {
    var m = /^([a-d])([1-8])$/.exec(String(sq || ""));
    return m ? (Number(m[2]) - 1) * ANCHO + COLUMNAS.indexOf(m[1]) : -1;
  }
  function dentro(f, r) { return f >= 0 && f < ANCHO && r >= 0 && r < ALTO; }
  function rival(c) { return c === "w" ? "b" : "w"; }

  /* ---------------------------------------------------------- la posición
     { b: 32 casillas (null o {t, c}), turno, ap (casilla del al paso o -1),
       medias (jugadas desde la última captura o jugada de peón) } */
  function nuevaPosicion() {
    var b = [];
    for (var i = 0; i < N; i++) b.push(null);
    for (var f = 0; f < ANCHO; f++) {
      b[f] = { t: PRIMERA[f], c: "w" };
      b[ANCHO + f] = { t: "p", c: "w" };
      b[6 * ANCHO + f] = { t: "p", c: "b" };
      b[7 * ANCHO + f] = { t: PRIMERA[f], c: "b" };
    }
    return { b: b, turno: "w", ap: -1, medias: 0 };
  }

  function pseudo(pos, c) {
    var out = [], b = pos.b;
    for (var i = 0; i < N; i++) {
      var p = b[i];
      if (!p || p.c !== c) continue;
      var f = i % ANCHO, r = Math.floor(i / ANCHO);
      var agregar = (function (desde, pieza) {
        return function (a, extra) {
          var m = { desde: desde, a: a, t: pieza.t, captura: b[a] ? b[a].t : null };
          if (extra) for (var k in extra) m[k] = extra[k];
          out.push(m);
        };
      })(i, p);
      if (p.t === "p") {
        var d = c === "w" ? 1 : -1, ultima = c === "w" ? 7 : 0, inicio = c === "w" ? 1 : 6;
        var avanzar = function (a, extra) {
          if (Math.floor(a / ANCHO) === ultima) {
            ["q", "r", "b", "n"].forEach(function (cor) {
              var e = { corona: cor };
              if (extra) for (var k in extra) e[k] = extra[k];
              agregar(a, e);
            });
          } else agregar(a, extra);
        };
        if (dentro(f, r + d) && !b[(r + d) * ANCHO + f]) {
          avanzar((r + d) * ANCHO + f);
          if (r === inicio && !b[(r + 2 * d) * ANCHO + f]) agregar((r + 2 * d) * ANCHO + f, { doble: true });
        }
        [-1, 1].forEach(function (df) {
          var nf = f + df, nr = r + d;
          if (!dentro(nf, nr)) return;
          var a = nr * ANCHO + nf;
          if (b[a] && b[a].c !== c) avanzar(a);
          else if (a === pos.ap && !b[a]) agregar(a, { alPaso: true, captura: "p" });
        });
      } else if (p.t === "n" || p.t === "k") {
        (p.t === "n" ? CABALLO : REY).forEach(function (dd) {
          var nf = f + dd[0], nr = r + dd[1];
          if (!dentro(nf, nr)) return;
          var a = nr * ANCHO + nf;
          if (!b[a] || b[a].c !== c) agregar(a);
        });
      } else {
        var dirs = p.t === "r" ? REY.slice(0, 4) : p.t === "b" ? REY.slice(4) : REY;
        dirs.forEach(function (dd) {
          var nf = f + dd[0], nr = r + dd[1];
          while (dentro(nf, nr)) {
            var a = nr * ANCHO + nf;
            if (b[a]) { if (b[a].c !== c) agregar(a); break; }
            agregar(a);
            nf += dd[0]; nr += dd[1];
          }
        });
      }
    }
    return out;
  }

  // ¿`por` ataca la casilla `sq`?
  function atacada(b, sq, por) {
    if (sq < 0) return false;
    var f = sq % ANCHO, r = Math.floor(sq / ANCHO), pd = por === "w" ? -1 : 1, k, nf, nr, p;
    for (k = -1; k <= 1; k += 2) {
      nf = f + k; nr = r + pd;
      if (dentro(nf, nr)) { p = b[nr * ANCHO + nf]; if (p && p.c === por && p.t === "p") return true; }
    }
    for (k = 0; k < 8; k++) {
      nf = f + CABALLO[k][0]; nr = r + CABALLO[k][1];
      if (dentro(nf, nr)) { p = b[nr * ANCHO + nf]; if (p && p.c === por && p.t === "n") return true; }
      nf = f + REY[k][0]; nr = r + REY[k][1];
      if (dentro(nf, nr)) { p = b[nr * ANCHO + nf]; if (p && p.c === por && p.t === "k") return true; }
    }
    for (k = 0; k < 8; k++) {
      nf = f + REY[k][0]; nr = r + REY[k][1];
      while (dentro(nf, nr)) {
        p = b[nr * ANCHO + nf];
        if (p) {
          if (p.c === por && (p.t === "q" || (k < 4 ? p.t === "r" : p.t === "b"))) return true;
          break;
        }
        nf += REY[k][0]; nr += REY[k][1];
      }
    }
    return false;
  }

  function hacer(pos, m) {
    var b = pos.b.slice(), p = b[m.desde];
    b[m.desde] = null;
    if (m.alPaso) b[m.a + (p.c === "w" ? -ANCHO : ANCHO)] = null;
    b[m.a] = m.corona ? { t: m.corona, c: p.c } : p;
    return {
      b: b, turno: rival(pos.turno),
      ap: m.doble ? (m.desde + m.a) / 2 : -1,
      medias: (p.t === "p" || m.captura) ? 0 : pos.medias + 1,
    };
  }

  function casillaDelRey(b, c) {
    for (var i = 0; i < N; i++) if (b[i] && b[i].t === "k" && b[i].c === c) return i;
    return -1;
  }
  function enJaque(pos, c) {
    c = c || pos.turno;
    return atacada(pos.b, casillaDelRey(pos.b, c), rival(c));
  }
  function legales(pos) {
    return pseudo(pos, pos.turno).filter(function (m) {
      var n = hacer(pos, m);
      return !atacada(n.b, casillaDelRey(n.b, pos.turno), n.turno);
    });
  }

  // Lo que se compara para la triple repetición: piezas, turno y al paso.
  function clave(pos) {
    return pos.b.map(function (p) { return p ? (p.c === "w" ? p.t.toUpperCase() : p.t) : "."; }).join("") + pos.turno + pos.ap;
  }

  // Ni con todo lo que queda se puede dar mate: solo reyes, o un caballo o un
  // alfil solos en todo el tablero.
  function insuficiente(b) {
    var resto = b.filter(function (p) { return p && p.t !== "k"; });
    return !resto.length || (resto.length === 1 && (resto[0].t === "n" || resto[0].t === "b"));
  }
  function soloRey(b, c) {
    return !b.some(function (p) { return p && p.c === c && p.t !== "k"; });
  }

  /* La jugada escrita en SAN inglés, como la devuelve chess.js: los módulos del
     sitio la pasan a español o a palabras al mostrarla (ComandosTablero). */
  var LETRA = { k: "K", q: "Q", r: "R", b: "B", n: "N", p: "" };
  function san(pos, m, todas) {
    var s = "";
    if (m.t === "p") {
      if (m.captura) s += COLUMNAS[m.desde % ANCHO] + "x";
      s += nombre(m.a);
      if (m.corona) s += "=" + LETRA[m.corona];
    } else {
      s += LETRA[m.t];
      var otras = (todas || legales(pos)).filter(function (x) { return x.t === m.t && x.a === m.a && x.desde !== m.desde; });
      if (otras.length) {
        var mismaCol = otras.some(function (x) { return x.desde % ANCHO === m.desde % ANCHO; });
        var mismaFila = otras.some(function (x) { return Math.floor(x.desde / ANCHO) === Math.floor(m.desde / ANCHO); });
        s += !mismaCol ? COLUMNAS[m.desde % ANCHO] : !mismaFila ? String(Math.floor(m.desde / ANCHO) + 1) : nombre(m.desde);
      }
      if (m.captura) s += "x";
      s += nombre(m.a);
    }
    var n = hacer(pos, m);
    if (enJaque(n)) s += legales(n).length ? "+" : "#";
    return s;
  }

  /* ------------------------------------------------------- la computadora
     Negamax con poda alfa-beta sobre el material y un poco de posición (el
     peón vale más cuanto más avanzado; caballo y dama, algo más en el centro).
     El azar se suma a la raíz para que no juegue siempre lo mismo, y es lo que
     separa los niveles junto con la profundidad. */
  var NIVELES = {
    1: { nombre: "Fácil", profundidad: 1, ruido: 120 },
    2: { nombre: "Medio", profundidad: 3, ruido: 20 },
    3: { nombre: "Difícil", profundidad: 4, ruido: 0 },
  };
  function evaluar(pos) {
    var s = 0;
    for (var i = 0; i < N; i++) {
      var p = pos.b[i];
      if (!p) continue;
      var v = VALOR[p.t], r = Math.floor(i / ANCHO), f = i % ANCHO;
      if (p.t === "p") v += (p.c === "w" ? r - 1 : 6 - r) * 12;
      if ((p.t === "n" || p.t === "q") && (f === 1 || f === 2)) v += 8;
      s += p.c === "w" ? v : -v;
    }
    return pos.turno === "w" ? s : -s;
  }
  function orden(m) { return (m.captura ? VALOR[m.captura] * 10 - VALOR[m.t] : 0) + (m.corona === "q" ? 8000 : 0); }
  function buscar(pos, prof, alfa, beta, ply) {
    var ms = legales(pos);
    if (!ms.length) return enJaque(pos) ? -MATE + ply : 0;
    if (pos.medias >= 100 || insuficiente(pos.b)) return 0;
    if (prof <= 0) return evaluar(pos);
    ms.sort(function (x, y) { return orden(y) - orden(x); });
    for (var i = 0; i < ms.length; i++) {
      var v = -buscar(hacer(pos, ms[i]), prof - 1, -beta, -alfa, ply + 1);
      if (v > alfa) { alfa = v; if (alfa >= beta) break; }
    }
    return alfa;
  }
  // Devuelve la jugada interna elegida. `azar` es una función como Math.random
  // (el verificador pasa una con semilla).
  function mejorJugada(pos, nivel, azar) {
    var cfg = NIVELES[nivel] || NIVELES[2];
    azar = azar || Math.random;
    // Coronar en alfil o torre nunca es mejor que en dama en este tablero; en
    // caballo sí puede serlo (da jaque). Se dejan fuera para no buscar de más.
    var ms = legales(pos).filter(function (m) { return !m.corona || m.corona === "q" || m.corona === "n"; });
    ms.sort(function (x, y) { return orden(y) - orden(x); });
    var mejor = null, mejorV = -Infinity;
    for (var i = 0; i < ms.length; i++) {
      var v = -buscar(hacer(pos, ms[i]), cfg.profundidad - 1, -Infinity, Infinity, 1) + azar() * cfg.ruido;
      if (v > mejorV) { mejorV = v; mejor = ms[i]; }
    }
    return mejor;
  }

  /* ------------------------------------------- la partida, como en chess.js */
  function aFuera(pos, m, todas) {
    var flags = "";
    if (m.alPaso) flags = "e";
    else if (m.doble) flags = "b";
    else if (m.captura) flags = "c";
    if (m.corona) flags = (m.captura ? "c" : "") + "p";
    if (!flags) flags = "n";
    var out = {
      color: pos.turno, from: nombre(m.desde), to: nombre(m.a), piece: m.t,
      flags: flags, san: san(pos, m, todas),
    };
    if (m.captura) out.captured = m.captura;
    if (m.corona) out.promotion = m.corona;
    return out;
  }

  function Partida() {
    this.pos = nuevaPosicion();
    this.pila = [];                 // { pos, jugada (como chess.js), interna }
    this.vistas = {};
    this.vistas[clave(this.pos)] = 1;
  }
  Partida.prototype.get = function (sq) {
    var i = indice(sq);
    var p = i >= 0 ? this.pos.b[i] : null;
    return p ? { type: p.t, color: p.c } : null;
  };
  Partida.prototype.turn = function () { return this.pos.turno; };
  Partida.prototype.in_check = function () { return enJaque(this.pos); };
  Partida.prototype.moves = function (opts) {
    opts = opts || {};
    var pos = this.pos, todas = legales(pos), ms = todas;
    if (opts.square) {
      var i = indice(opts.square);
      ms = ms.filter(function (m) { return m.desde === i; });
    }
    var fuera = ms.map(function (m) { return aFuera(pos, m, todas); });
    return opts.verbose ? fuera : fuera.map(function (m) { return m.san; });
  };
  Partida.prototype.interna = function (jugada) {
    var desde = indice(jugada && jugada.from), a = indice(jugada && jugada.to);
    var cor = jugada && jugada.promotion ? String(jugada.promotion).toLowerCase() : null;
    var cand = legales(this.pos).filter(function (m) { return m.desde === desde && m.a === a; });
    if (!cand.length) return null;
    if (cand[0].corona) return cand.filter(function (m) { return m.corona === (cor || "q"); })[0] || null;
    return cand[0];
  };
  Partida.prototype.mover = function (m) {
    var todas = legales(this.pos);
    var fuera = aFuera(this.pos, m, todas);
    this.pila.push({ pos: this.pos, jugada: fuera });
    this.pos = hacer(this.pos, m);
    var k = clave(this.pos);
    this.vistas[k] = (this.vistas[k] || 0) + 1;
    return fuera;
  };
  // { from, to, promotion? } como en chess.js. Devuelve la jugada hecha o null.
  Partida.prototype.move = function (jugada) {
    var m = this.interna(jugada);
    return m ? this.mover(m) : null;
  };
  Partida.prototype.undo = function () {
    var ultima = this.pila.pop();
    if (!ultima) return null;
    var k = clave(this.pos);
    this.vistas[k] -= 1;
    if (!this.vistas[k]) delete this.vistas[k];
    this.pos = ultima.pos;
    return ultima.jugada;
  };
  Partida.prototype.history = function (opts) {
    var js = this.pila.map(function (x) { return x.jugada; });
    return opts && opts.verbose ? js : js.map(function (j) { return j.san; });
  };
  // null mientras se juega; si terminó, { resultado: "1-0" | "0-1" | "½-½", motivo }.
  Partida.prototype.fin = function () {
    var pos = this.pos;
    if (!legales(pos).length) {
      if (enJaque(pos)) return { resultado: pos.turno === "w" ? "0-1" : "1-0", motivo: "Jaque mate" };
      return { resultado: "½-½", motivo: "Rey ahogado" };
    }
    if ((this.vistas[clave(pos)] || 0) >= 3) return { resultado: "½-½", motivo: "Triple repetición" };
    if (pos.medias >= 100) return { resultado: "½-½", motivo: "Regla de las cincuenta jugadas" };
    if (insuficiente(pos.b)) return { resultado: "½-½", motivo: "Material insuficiente" };
    return null;
  };
  // Si al que se le cae la bandera tiene enfrente un rival con solo el rey, son
  // tablas: con el rey solo no se puede ganar.
  Partida.prototype.bandera = function (color) {
    if (soloRey(this.pos.b, rival(color))) return { resultado: "½-½", motivo: "Se acabó el tiempo de las " + (color === "w" ? "blancas" : "negras") + ", pero el rival solo tiene el rey" };
    return { resultado: color === "w" ? "0-1" : "1-0", motivo: "Se acabó el tiempo de las " + (color === "w" ? "blancas" : "negras") };
  };
  // La jugada que elige la computadora, como la devolvería moves({verbose}).
  Partida.prototype.jugadaDeLaComputadora = function (nivel, azar) {
    var m = mejorJugada(this.pos, nivel, azar);
    return m ? aFuera(this.pos, m) : null;
  };

  var API = {
    COLUMNAS: COLUMNAS, ANCHO: ANCHO, ALTO: ALTO, NIVELES: NIVELES,
    nombre: nombre, indice: indice, nuevaPosicion: nuevaPosicion,
    legales: legales, hacer: hacer, enJaque: enJaque, san: san, clave: clave,
    insuficiente: insuficiente, mejorJugada: mejorJugada, Partida: Partida,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  if (raiz) raiz.Ajedrez4x8 = API;
})(typeof window !== "undefined" ? window : null);
