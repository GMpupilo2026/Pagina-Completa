/* Preparación de rivales: su libro, para jugar contra «él».
 *
 * El libro es lo que el rival juega en cada posición de su árbol, con cuántas
 * veces jugó cada jugada ahí y su peso (lo reciente pesa más):
 * { "<huella de la posición>": [["c5", 41, 30.5], ["e5", 12, 3.2]] }.
 * Lo arma el análisis (libroDe en js/preparacion-analisis.js), solo en las
 * posiciones donde le toca a él, y viaja con el resultado guardado y con el
 * plan que se le manda al alumno. «Juega contra él» (js/preparacion-sparring.js)
 * lo lee: en cada jugada suya elige una de sus jugadas, sorteada con el peso
 * de las veces que la jugó.
 *
 * La posición se busca por su huella (53 bits en base 36, unos 11 caracteres)
 * y no por la clave entera de js/preparacion-posiciones.js, que pesa unos 60:
 * con 1000 posiciones por color, el libro pasaría de unos 45 KB a 110. Con
 * 2000 posiciones, que dos compartan huella pasa menos de una vez en mil
 * millones.
 *
 *   huella(clave)              → "k3j9…"  (la clave de PreparacionPosiciones)
 *   claveDeFen(fen)            → la clave de esa posición, igual que en el árbol
 *   jugadas(libro, fen)        → [{ san, n, reparto }] de la más jugada a la menos, o []
 *   elegir(libro, fen, azar)   → { san, n, reparto } sorteada por las veces, o null
 *   seguirPlan(plan, sec, color) → hasta dónde las jugadas `sec` siguieron el plan
 */
(function (raiz, fabrica) {
  "use strict";
  const req = (nombre, global) => (raiz && raiz[global]) || (typeof require === "function" ? require(nombre) : null);
  const api = fabrica(req("./preparacion-posiciones.js", "PreparacionPosiciones"));
  if (typeof module === "object" && module.exports) module.exports = api;
  else raiz.PreparacionLibro = api;
})(typeof self !== "undefined" ? self : this, function (Pos) {
  "use strict";

  // cyrb53 (dominio público): 53 bits, bien repartidos, sin dependencias.
  function huella(texto) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < texto.length; i++) {
      const ch = texto.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }

  // Los cuatro primeros campos del FEN, con la convención del árbol (la de
  // chess.js 0.10.3: la casilla al paso va siempre que un peón avanza dos).
  function claveDeFen(fen) { return Pos.clave(Pos.desdeFen(fen)); }

  function jugadas(libro, fen) {
    const lista = libro && libro[huella(claveDeFen(fen))];
    if (!lista || !lista.length) return [];
    // [jugada, partidas, peso]: el reparto va con el peso (lo reciente pesa más,
    // ver ponerPesos en el análisis); un libro sin peso usa las partidas.
    const peso = (x) => (x[2] != null ? x[2] : x[1]);
    const total = lista.reduce((s, x) => s + peso(x), 0) || 1;
    return lista.map((x) => ({ san: x[0], n: x[1], reparto: peso(x) / total }));
  }

  // Sorteada con el peso de las veces: una jugada que hace 3 de cada 4 veces
  // sale 3 de cada 4. `azar` es un número en [0, 1) (Math.random() si no).
  function elegir(libro, fen, azar) {
    const js = jugadas(libro, fen);
    if (!js.length) return null;
    let r = (azar == null ? Math.random() : azar);
    for (const x of js) { if (r < x.reparto) return x; r -= x.reparto; }
    return js[js.length - 1];
  }

  /* ¿Hasta dónde siguieron el plan las jugadas `sec`? El plan es el árbol de
     un lado (nodos { san, quien: "tu"|"rival", hijos }). Se baja por él
     mientras cada jugada esté: en las tuyas, la del plan; en las suyas,
     cualquiera de las que el plan prepara.
       → { seguidas,                cuántas medias jugadas estuvieron en el plan
           desvio: { i, jugada, plan }   la primera tuya que no era la del plan
           sinPreparar: { i, jugada }    la primera suya que el plan no cubre
           fin: true }                   el plan se acabó sin salirse */
  function seguirPlan(plan, sec, color) {
    let nodos = plan || [];
    for (let i = 0; i < sec.length; i++) {
      if (!nodos.length) return { seguidas: i, fin: true };
      const x = nodos.find((n) => n.san === sec[i]);
      const mia = (color === "w") === (i % 2 === 0);
      if (!x) {
        return mia ? { seguidas: i, desvio: { i, jugada: sec[i], plan: nodos[0].san } }
          : { seguidas: i, sinPreparar: { i, jugada: sec[i] } };
      }
      nodos = x.hijos || [];
    }
    return { seguidas: sec.length, fin: !nodos.length };
  }

  return { huella, claveDeFen, jugadas, elegir, seguirPlan };
});
