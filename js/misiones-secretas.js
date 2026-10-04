/* Misiones secretas: el catálogo de misiones y cómo se sabe si una está
   cumplida (variante.html, con variant = "misiones").

   Cada jugador recibe una misión que el rival no ve. La reparte la base
   (repartir_misiones(), al azar) y la guarda en misiones_secretas, que solo
   le muestra a cada uno la suya mientras se juega: ver «Misiones secretas» en
   docs/decisiones/juegos-y-torneos.md. Los nombres (`id`) tienen que ser los
   mismos que la lista de esa función; verificar-misiones-secretas.js lo
   comprueba, y también que ninguna esté cumplida en la posición de salida.

   Se gana por jaque mate como siempre, o si AL LLEGAR TU TURNO tu misión está
   cumplida: la cumpliste con tu jugada y tu rival no pudo (o no supo)
   deshacerla. Las filas se cuentan desde cada bando: la «sexta» de las negras
   es la tercera del tablero.

   cumple(juego, color) recibe un juego de chess.js (o cualquier cosa con
   get(casilla)) y "w" o "b". */
(function () {
  "use strict";

  const COLUMNAS = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const VALOR = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

  function piezas(juego) {
    const out = [];
    for (let r = 1; r <= 8; r++) for (const f of COLUMNAS) {
      const p = juego.get(f + r);
      if (p) out.push({ casilla: f + r, col: f, fila: r, type: p.type, color: p.color });
    }
    return out;
  }
  // La fila vista desde `color`: 1 es la propia, 8 la del rival.
  const filaDe = (p, color) => (color === "w" ? p.fila : 9 - p.fila);
  const otro = (c) => (c === "w" ? "b" : "w");
  const cuantas = (ps, color, tipo) => ps.filter((p) => p.color === color && p.type === tipo).length;

  const CATALOGO = [
    { id: "caballo_avanzado", titulo: "Caballo de avanzada",
      texto: "Pon un caballo en tu sexta fila, en una de las columnas centrales (c, d, e o f).",
      cumple: (ps, c) => ps.some((p) => p.color === c && p.type === "n" && filaDe(p, c) === 6 && "cdef".indexOf(p.col) !== -1) },
    { id: "torre_septima", titulo: "Torre en séptima",
      texto: "Pon una torre en tu séptima fila (la segunda fila del rival).",
      cumple: (ps, c) => ps.some((p) => p.color === c && p.type === "r" && filaDe(p, c) === 7) },
    { id: "sin_alfiles", titulo: "Sin alfiles rivales",
      texto: "Deja al rival sin ningún alfil, conservando por lo menos uno tuyo.",
      cumple: (ps, c) => cuantas(ps, otro(c), "b") === 0 && cuantas(ps, c, "b") > 0 },
    { id: "cazar_dama", titulo: "Caza de la dama",
      texto: "Captura la dama rival (todas, si coronó) conservando la tuya.",
      cumple: (ps, c) => cuantas(ps, otro(c), "q") === 0 && cuantas(ps, c, "q") > 0 },
    { id: "peon_sexta", titulo: "Peón en sexta",
      texto: "Lleva un peón tuyo hasta tu sexta fila.",
      cumple: (ps, c) => ps.some((p) => p.color === c && p.type === "p" && filaDe(p, c) === 6) },
    { id: "torres_dobladas", titulo: "Torres dobladas",
      texto: "Pon tus dos torres en la misma columna, sin nada entre ellas, en una columna sin peones tuyos.",
      cumple: (ps, c) => {
        const torres = ps.filter((p) => p.color === c && p.type === "r");
        for (let i = 0; i < torres.length; i++) for (let j = i + 1; j < torres.length; j++) {
          const a = torres[i], b = torres[j];
          if (a.col !== b.col) continue;
          const lo = Math.min(a.fila, b.fila), hi = Math.max(a.fila, b.fila);
          const entre = ps.some((p) => p.col === a.col && p.fila > lo && p.fila < hi);
          const peonPropio = ps.some((p) => p.col === a.col && p.type === "p" && p.color === c);
          if (!entre && !peonPropio) return true;
        }
        return false;
      } },
    { id: "sin_caballos", titulo: "Sin caballos rivales",
      texto: "Deja al rival sin ningún caballo.",
      cumple: (ps, c) => cuantas(ps, otro(c), "n") === 0 },
    { id: "rey_valiente", titulo: "Rey valiente",
      texto: "Lleva tu rey hasta tu cuarta fila o más adelante.",
      cumple: (ps, c) => ps.some((p) => p.color === c && p.type === "k" && filaDe(p, c) >= 4) },
    { id: "centro", titulo: "Dueño del centro",
      texto: "Ten peones tuyos en d4 y e4 (las negras, en d5 y e5) y que el rival no tenga peones en las columnas d ni e.",
      cumple: (ps, c) => {
        const fila = c === "w" ? 4 : 5;
        const tiene = (col) => ps.some((p) => p.color === c && p.type === "p" && p.col === col && p.fila === fila);
        const rivalEnCentro = ps.some((p) => p.color === otro(c) && p.type === "p" && (p.col === "d" || p.col === "e"));
        return tiene("d") && tiene("e") && !rivalEnCentro;
      } },
    { id: "ventaja_material", titulo: "Ventaja de material",
      texto: "Saca 5 puntos de ventaja en material (peón 1, caballo y alfil 3, torre 5, dama 9).",
      cumple: (ps, c) => {
        const suma = (col) => ps.filter((p) => p.color === col).reduce((t, p) => t + VALOR[p.type], 0);
        return suma(c) - suma(otro(c)) >= 5;
      } },
  ];

  function buscar(id) { return CATALOGO.find((m) => m.id === id) || null; }

  window.MisionesSecretas = {
    CATALOGO,
    buscar,
    cumple(id, juego, color) {
      const m = buscar(id);
      return !!m && m.cumple(piezas(juego), color);
    },
  };
})();
