/* Preparación de rivales: la clave de la posición después de cada jugada,
 * rápido.
 *
 * El árbol de un rival se arma con la secuencia de jugadas, pero 1.d4 Cf6 2.c4 e6
 * y 1.c4 e6 2.d4 Cf6 son la misma posición: para contarlas juntas hace falta
 * saber a qué posición lleva cada nodo. chess.js lo sabe, pero tarda unos 365 µs
 * por jugada (genera todas las jugadas legales para leer cada SAN): con 30.000
 * partidas, casi un minuto. Esto solo aplica la jugada escrita, que ya viene de
 * una partida jugada: busca la pieza que puede llegar (y, si hay dos y el SAN no
 * dice cuál, descarta la que está clavada), mueve, y lleva enroques y al paso.
 * Tarda unos pocos microsegundos.
 *
 * La clave es la de js/chess-bot.js y del libro de Oscar: colocación, turno,
 * enroques y casilla al paso, con la convención de chess.js 0.10.3 (la casilla
 * al paso se pone SIEMPRE que un peón avanza dos, sin mirar si se puede comer).
 * verificar-preparacion-rivales.js la compara contra chess.js jugada por jugada.
 *
 *   inicial()            → estado de la posición inicial
 *   aplicar(estado, san) → estado nuevo, o null si la jugada no se puede hacer
 *   clave(estado)        → "rnbqkbnr/… w KQkq -"
 */
(function (raiz, fabrica) {
  "use strict";
  const api = fabrica();
  if (typeof module === "object" && module.exports) module.exports = api;
  else raiz.PreparacionPosiciones = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Casilla = fila * 8 + columna; fila 0 es la 1, columna 0 es la a.
  const COLUMNAS = "abcdefgh";
  const casilla = (texto) => (texto.charCodeAt(1) - 49) * 8 + (texto.charCodeAt(0) - 97);
  const nombre = (c) => COLUMNAS[c & 7] + ((c >> 3) + 1);

  const SALTOS_CABALLO = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
  const PASOS_REY = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const RECTAS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const DIAGONALES = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

  function inicial() {
    const t = new Array(64).fill("");
    const fila = "RNBQKBNR";
    for (let c = 0; c < 8; c++) {
      t[c] = fila[c]; t[8 + c] = "P";
      t[48 + c] = "p"; t[56 + c] = fila[c].toLowerCase();
    }
    return { t, turno: "w", enroques: "KQkq", alPaso: -1 };
  }

  function dentro(col, fil) { return col >= 0 && col < 8 && fil >= 0 && fil < 8; }
  const blanca = (p) => p !== "" && p === p.toUpperCase();
  const deColor = (p, color) => p !== "" && (color === "w" ? blanca(p) : !blanca(p));

  // ¿Alguna pieza de `color` ataca la casilla `c`?
  function atacada(t, c, color) {
    const col = c & 7, fil = c >> 3;
    const P = (x) => (color === "w" ? x.toUpperCase() : x);
    // Peones: atacan en diagonal hacia adelante.
    const dirPeon = color === "w" ? -1 : 1;
    for (const dc of [-1, 1]) {
      const cc = col + dc, ff = fil + dirPeon;
      if (dentro(cc, ff) && t[ff * 8 + cc] === P("p")) return true;
    }
    for (const [dc, df] of SALTOS_CABALLO) {
      const cc = col + dc, ff = fil + df;
      if (dentro(cc, ff) && t[ff * 8 + cc] === P("n")) return true;
    }
    for (const [dc, df] of PASOS_REY) {
      const cc = col + dc, ff = fil + df;
      if (dentro(cc, ff) && t[ff * 8 + cc] === P("k")) return true;
    }
    for (const [dirs, piezas] of [[RECTAS, [P("r"), P("q")]], [DIAGONALES, [P("b"), P("q")]]]) {
      for (const [dc, df] of dirs) {
        let cc = col + dc, ff = fil + df;
        while (dentro(cc, ff)) {
          const p = t[ff * 8 + cc];
          if (p !== "") { if (piezas.includes(p)) return true; break; }
          cc += dc; ff += df;
        }
      }
    }
    return false;
  }

  // Las casillas desde donde una pieza de ese tipo y color llega a `destino`.
  function origenes(t, tipo, color, destino) {
    const out = [];
    const pieza = color === "w" ? tipo : tipo.toLowerCase();
    const col = destino & 7, fil = destino >> 3;
    if (tipo === "N" || tipo === "K") {
      for (const [dc, df] of tipo === "N" ? SALTOS_CABALLO : PASOS_REY) {
        const cc = col + dc, ff = fil + df;
        if (dentro(cc, ff) && t[ff * 8 + cc] === pieza) out.push(ff * 8 + cc);
      }
      return out;
    }
    const dirs = tipo === "R" ? RECTAS : tipo === "B" ? DIAGONALES : RECTAS.concat(DIAGONALES);
    for (const [dc, df] of dirs) {
      let cc = col + dc, ff = fil + df;
      while (dentro(cc, ff)) {
        const p = t[ff * 8 + cc];
        if (p !== "") { if (p === pieza) out.push(ff * 8 + cc); break; }
        cc += dc; ff += df;
      }
    }
    return out;
  }

  function reyDe(t, color) { return t.indexOf(color === "w" ? "K" : "k"); }

  function quitarEnroque(enroques, c) {
    if (c === 0) return enroques.replace("Q", "");
    if (c === 7) return enroques.replace("K", "");
    if (c === 56) return enroques.replace("q", "");
    if (c === 63) return enroques.replace("k", "");
    return enroques;
  }

  const SAN = /^([KQRBN])?([a-h])?([1-8])?(x)?([a-h][1-8])(?:=?([QRBN]))?$/;

  function aplicar(e, san) {
    const color = e.turno;
    const otro = color === "w" ? "b" : "w";
    const t = e.t.slice();
    let enroques = e.enroques;
    let alPaso = -1;
    const limpio = String(san).replace(/[+#!?]+$/, "");

    if (limpio === "O-O" || limpio === "O-O-O") {
      const fila = color === "w" ? 0 : 56;
      const largo = limpio === "O-O-O";
      const rey = fila + 4, torre = fila + (largo ? 0 : 7);
      const R = color === "w" ? "K" : "k", T = color === "w" ? "R" : "r";
      if (t[rey] !== R || t[torre] !== T) return null;
      t[rey] = ""; t[torre] = "";
      t[fila + (largo ? 2 : 6)] = R; t[fila + (largo ? 3 : 5)] = T;
      enroques = color === "w" ? enroques.replace(/[KQ]/g, "") : enroques.replace(/[kq]/g, "");
      return { t, turno: otro, enroques, alPaso };
    }

    const m = limpio.match(SAN);
    if (!m) return null;
    const tipo = m[1] || "P";
    const destino = casilla(m[5]);
    const colOrigen = m[2] ? m[2].charCodeAt(0) - 97 : -1;
    const filOrigen = m[3] ? m[3].charCodeAt(0) - 49 : -1;
    const come = !!m[4];
    let desde = -1;

    if (tipo === "P") {
      const avance = color === "w" ? 8 : -8;
      const peon = color === "w" ? "P" : "p";
      if (come) {
        if (colOrigen < 0) return null;
        desde = (destino >> 3) * 8 - avance + colOrigen;
        if (t[desde] !== peon) return null;
        if (t[destino] === "") {
          // Al paso: el peón comido está detrás de la casilla de llegada.
          if (destino !== e.alPaso) return null;
          t[destino - avance] = "";
        }
      } else {
        if (t[destino] !== "") return null;
        if (t[destino - avance] === peon) desde = destino - avance;
        else if (t[destino - avance] === "" && t[destino - 2 * avance] === peon &&
                 (destino >> 3) === (color === "w" ? 3 : 4)) {
          desde = destino - 2 * avance;
          alPaso = destino - avance;
        } else return null;
      }
      t[desde] = "";
      const corona = m[6];
      t[destino] = corona ? (color === "w" ? corona : corona.toLowerCase()) : peon;
    } else {
      if (t[destino] !== "" && deColor(t[destino], color)) return null;
      let cand = origenes(t, tipo, color, destino)
        .filter((c) => (colOrigen < 0 || (c & 7) === colOrigen) && (filOrigen < 0 || (c >> 3) === filOrigen));
      if (cand.length > 1) {
        // El SAN no dice cuál porque una de las dos está clavada.
        cand = cand.filter((c) => {
          const prueba = t.slice();
          prueba[destino] = prueba[c]; prueba[c] = "";
          return !atacada(prueba, reyDe(prueba, color), otro);
        });
      }
      if (cand.length !== 1) return null;
      desde = cand[0];
      t[destino] = t[desde];
      t[desde] = "";
      if (tipo === "K") enroques = color === "w" ? enroques.replace(/[KQ]/g, "") : enroques.replace(/[kq]/g, "");
    }
    enroques = quitarEnroque(quitarEnroque(enroques, desde), destino);
    return { t, turno: otro, enroques, alPaso };
  }

  function clave(e) {
    const filas = [];
    for (let fil = 7; fil >= 0; fil--) {
      let s = "", vacias = 0;
      for (let col = 0; col < 8; col++) {
        const p = e.t[fil * 8 + col];
        if (p === "") vacias += 1;
        else { if (vacias) { s += vacias; vacias = 0; } s += p.toUpperCase() === p ? p : p; }
      }
      if (vacias) s += vacias;
      filas.push(s);
    }
    // Las piezas blancas van en mayúscula y las negras en minúscula, como en FEN.
    return filas.join("/") + " " + e.turno + " " + (e.enroques || "-") + " " + (e.alPaso >= 0 ? nombre(e.alPaso) : "-");
  }

  return { inicial, aplicar, clave };
});
