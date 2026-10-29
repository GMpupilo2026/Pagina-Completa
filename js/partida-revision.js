/* Lo que se le dice al profe de una partida que no cuadró al revisarla
   (partidas_revision, que escribe la Edge Function partida-fin con
   supabase/functions/partida-fin/revision.ts). Ver «La partida terminada se
   revisa con chess.js» en docs/decisiones/juegos-y-torneos.md. */
(function () {
  "use strict";

  const MOTIVOS = {
    jugada_ilegal: "Una jugada ilegal",
    posicion_distinta: "Las jugadas no llevan a la posición final",
    resultado_contra_el_mate: "El resultado no es el del mate en el tablero",
    resultado_contra_el_ahogado: "El tablero quedó en ahogado y la partida tiene ganador",
  };

  /* Una línea para la tarjeta: el motivo y dónde. */
  function texto(fila) {
    if (!fila) return "";
    let t = MOTIVOS[fila.motivo] || "Algo no cuadra";
    // `jugada` cuenta medias jugadas: la 11 es la sexta de las blancas.
    if (fila.motivo === "jugada_ilegal" && fila.jugada) {
      t += " (la número " + fila.jugada + " de la lista: " + fila.detalle + ")";
    } else if (fila.jugada) {
      t += " (al final, tras " + fila.jugada + " jugadas de la lista)";
    }
    return t + ".";
  }

  window.PartidaRevision = { MOTIVOS, texto };
})();
