// El juego limpio de la sala de arena, sin nada de Supabase ni de Deno: dos
// funciones puras que se prueban desde Node con el chess.js del resto del
// sitio (herramientas/verificar-sala-base.js) y corren en la Edge Function
// (index.ts) con el de npm, sin dos copias. Ver «El juego limpio de la sala
// de arena» en docs/decisiones/juegos-y-torneos.md.
//
// La base acepta la posición que manda el navegador de quien mueve: desde la
// consola se puede declarar una jugada ilegal o un mate que no es. Esto no lo
// impide (la partida sigue fluida); lo encuentra al final y lo deja anotado
// para que quien administra decida.

const POSICION_INICIAL = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// Lo que se compara de dos posiciones: las piezas y a quién le toca. El
// enroque y la captura al paso se escriben distinto según quién arma la FEN.
const tablero = (fen) => String(fen || "").split(" ").slice(0, 2).join(" ");

// Los problemas de una partida terminada (vacío si todo cuadra):
//   { tipo, jugada, detalle }
//   tipo: "jugada_ilegal" (no se puede jugar en esa posición, o la casilla
//         de salida o de llegada no es la de la jugada) | "posicion_distinta"
//         (la posición guardada no es la que dejan las jugadas) |
//         "fin_falso" (se declaró mate, ahogado, material, repetición o
//         cincuenta jugadas y la posición no lo es) | "resultado_contra_el_mate"
//         (hay mate en el tablero y el resultado dice otra cosa)
// Con una jugada ilegal se para: lo que viene después ya no se puede revisar.
export function revisarArena(Chess, partida) {
  const p = partida || {};
  const chess = new Chess(POSICION_INICIAL);
  const jugadas = Array.isArray(p.jugadas) ? p.jugadas : [];
  const problemas = [];
  for (let i = 0; i < jugadas.length; i++) {
    const j = jugadas[i] || {};
    let hecha = null;
    try { hecha = chess.move(String(j.s || "")); } catch { hecha = null; }
    if (!hecha || (j.f && hecha.from !== j.f) || (j.t && hecha.to !== j.t)) {
      problemas.push({ tipo: "jugada_ilegal", jugada: i + 1, detalle: String(j.s || "") });
      return problemas;
    }
  }
  if (p.fen && tablero(chess.fen()) !== tablero(p.fen)) {
    problemas.push({ tipo: "posicion_distinta", jugada: jugadas.length, detalle: String(p.fen) });
    return problemas;
  }
  const medio = Number(chess.fen().split(" ")[4]) || 0;
  const es = {
    mate: () => chess.in_checkmate(),
    ahogado: () => chess.in_stalemate(),
    material: () => chess.insufficient_material(),
    repeticion: () => chess.in_threefold_repetition(),
    cincuenta: () => medio >= 100,
  };
  if (es[p.motivo] && !es[p.motivo]()) {
    problemas.push({ tipo: "fin_falso", jugada: jugadas.length, detalle: String(p.motivo) });
  }
  if (chess.in_checkmate() && p.resultado) {
    const gana = chess.turn() === "w" ? "0-1" : "1-0";
    if (p.resultado !== gana) problemas.push({ tipo: "resultado_contra_el_mate", jugada: jugadas.length, detalle: String(p.resultado) });
  }
  return problemas;
}

// A partir de cuántas salidas de la pantalla se avisa.
export const SALIDAS_AVISO = 3;
// Tiempos parejos: con al menos estas jugadas propias después de la apertura,
// un coeficiente de variación por debajo de este y un promedio de al menos
// estos milisegundos (jugar todo rápido es normal en una arena).
export const PAREJOS_JUGADAS = 15;
export const PAREJOS_CV = 0.25;
export const PAREJOS_MS = 3000;
// Las primeras jugadas de cada uno no se miran: la apertura se juega de memoria.
const APERTURA = 5;

// Los indicios de cada color: { w: [...], b: [...] }, cada uno
//   { tipo: "salidas", veces } | { tipo: "tiempos_parejos", jugadas, promedio_ms }
// Son indicios, no pruebas: la pantalla lo dice así.
export function indiciosArena(partida, revision) {
  const p = partida || {};
  const r = revision || {};
  const out = { w: [], b: [] };
  const salidas = { w: Number(r.salidas_blancas) || 0, b: Number(r.salidas_negras) || 0 };
  for (const c of ["w", "b"]) {
    if (salidas[c] >= SALIDAS_AVISO) out[c].push({ tipo: "salidas", veces: salidas[c] });
  }
  const jugadas = Array.isArray(p.jugadas) ? p.jugadas : [];
  for (const c of ["w", "b"]) {
    const propios = jugadas
      .filter((_, i) => (i % 2 === 0) === (c === "w"))
      .slice(APERTURA)
      .map((j) => Number(j && j.ms))
      .filter((x) => Number.isFinite(x) && x >= 0);
    if (propios.length < PAREJOS_JUGADAS) continue;
    const prom = propios.reduce((a, x) => a + x, 0) / propios.length;
    if (prom < PAREJOS_MS) continue;
    const desv = Math.sqrt(propios.reduce((a, x) => a + (x - prom) ** 2, 0) / propios.length);
    if (desv / prom < PAREJOS_CV) out[c].push({ tipo: "tiempos_parejos", jugadas: propios.length, promedio_ms: Math.round(prom) });
  }
  return out;
}
