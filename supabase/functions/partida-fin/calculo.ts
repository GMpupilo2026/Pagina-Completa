// El cálculo del robo de puntos, sin nada de Supabase ni de Deno: una
// función pura que recibe un tablero de chess.js ya en la posición inicial
// y reproduce las jugadas, para poder probarla desde Node con el chess.js
// que ya usa el resto del sitio (herramientas/verificar-puntos-robo.js) y
// desde la Edge Function (index.ts) con el chess.js de npm, sin dos copias
// de la misma cuenta.

const VALOR = { p: 1, n: 3, b: 3, r: 5, q: 9 };

// Ventaja en material de la posición actual del tablero, en peones
// (positivo = blancas arriba). El rey no entra: no tiene "valor" que perder.
export function materialDe(chess) {
  let total = 0;
  for (const fila of chess.board()) {
    for (const casilla of fila) {
      if (!casilla) continue;
      const v = VALOR[casilla.type] || 0;
      total += casilla.color === "w" ? v : -v;
    }
  }
  return total;
}

// Reproduce la partida jugada a jugada (SAN, las mismas que guarda
// game_rooms.moves) y busca el peor momento de quien terminó ganando: la
// mayor ventaja en material que tuvo el perdedor en algún punto. 0 si el
// perdedor nunca estuvo arriba, o si alguna jugada no calza (no se sigue
// inventando una partida que no se jugó así).
export function peorMomentoDelGanador(chess, jugadas, colorGanador) {
  let peor = 0;
  for (const san of jugadas || []) {
    let jugada;
    try {
      jugada = chess.move(san);
    } catch {
      jugada = null;
    }
    if (!jugada) break;
    const balance = materialDe(chess); // positivo = blancas arriba
    const ventajaDelPerdedor = colorGanador === "white" ? -balance : balance;
    if (ventajaDelPerdedor > peor) peor = ventajaDelPerdedor;
  }
  return peor;
}

// La ventaja perdida (en peones) a los puntos que se roban.
export function puntosDelRobo(peorMomento) {
  return Math.max(0, Math.round((peorMomento || 0) * 100));
}
