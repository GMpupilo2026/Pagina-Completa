// La revisión de una partida terminada, sin nada de Supabase ni de Deno:
// una función pura que rehace las jugadas con chess.js, para probarla desde
// Node con el chess.js del resto del sitio (herramientas/verificar-partida-
// revision.js) y correrla en la Edge Function (index.ts) con el de npm, sin
// dos copias. Ver «La partida terminada se revisa con chess.js» en
// docs/decisiones/juegos-y-torneos.md.
//
// La base acepta la posición que manda el navegador: desde la consola se
// puede escribir cualquier tablero. Esto no lo impide (la partida sigue
// fluida, sin esperar a un servidor en cada jugada); lo encuentra al final y
// lo deja anotado para que el profe lo mire.

const POSICION_INICIAL = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// Lo que se compara de dos posiciones: las piezas y a quién le toca. El
// enroque y la captura al paso se escriben distinto según quién arma la FEN.
const tablero = (fen) => String(fen || "").split(" ").slice(0, 2).join(" ");

// Devuelve null si todo cuadra, o lo primero que no cuadra:
//   { motivo, jugada, detalle }
//   motivo: "jugada_ilegal" | "posicion_distinta" | "resultado_contra_el_mate"
//           | "resultado_contra_el_ahogado" (lo que se le dice al profe de
//           cada uno está en js/partida-revision.js)
// fenInicial null = una sala de antes de que la base la guardara: se supone
// la posición de siempre y, si las jugadas no calzan con ella, no se dice
// nada (pudo arrancar de otra posición; no se acusa sin saber).
export function revisarPartida(Chess, { fenInicial, jugadas, fenFinal, resultado }) {
  const sabida = typeof fenInicial === "string" && fenInicial !== "";
  const chess = new Chess(sabida ? fenInicial : POSICION_INICIAL);
  const lista = Array.isArray(jugadas) ? jugadas : [];
  for (let i = 0; i < lista.length; i++) {
    let hecha = null;
    try { hecha = chess.move(String(lista[i])); } catch { hecha = null; }
    if (!hecha) {
      if (!sabida) return null;
      return { motivo: "jugada_ilegal", jugada: i + 1, detalle: String(lista[i]) };
    }
  }
  if (fenFinal && tablero(chess.fen()) !== tablero(fenFinal)) {
    if (!sabida) return null;
    return { motivo: "posicion_distinta", jugada: lista.length, detalle: String(fenFinal) };
  }
  if (chess.in_checkmate()) {
    const gana = chess.turn() === "w" ? "black" : "white";
    if (resultado !== gana) return { motivo: "resultado_contra_el_mate", jugada: lista.length, detalle: String(resultado) };
  } else if (chess.in_stalemate() && resultado !== "draw") {
    return { motivo: "resultado_contra_el_ahogado", jugada: lista.length, detalle: String(resultado) };
  }
  return null;
}
