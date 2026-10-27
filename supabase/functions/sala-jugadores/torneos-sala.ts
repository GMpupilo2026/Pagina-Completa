// Lo que sala-jugadores arma con los torneos de una sala, sin nada de Deno:
// herramientas/verificar-centroamericano.js lo importa con node y lo prueba.
// Ver «Un torneo por categoría» en docs/decisiones/juegos-y-torneos.md.

export type Jug = { puesto: number; no: number; titulo: string; nombre: string; fed: string; elo: number; grupo: string; puntos: string };
export type Mesa = { mesa: number; blancas: { no: number; titulo: string; nombre: string }; negras: { no: number; titulo: string; nombre: string } | null; resultado: string };
type Torneo = { tnr: string; ronda?: number; rondas?: number; jugadores?: Jug[]; pareo?: { ronda: number; mesas: Mesa[] } | null };

// La categoría que dice el texto de un enlace de la sala, con el código de
// chess-results: «Sub-10 Femenino» → «U10F», «U08» → «U08», «Resultados U12
// Girls» → «U12F». Sin categoría, «». Con el Centroamericano partido en un
// torneo por categoría, la clasificación ya no trae la columna «Gr»: la
// categoría de cada jugador es la de su torneo, y la escribe quien administra
// en el texto del enlace (admin.html#torneos).
export function codigoCategoria(texto: string): string {
  const t = String(texto || "");
  const m = t.match(/(?:^|[^A-Za-z0-9])(?:U|Sub)[\s-]*0?(\d{1,2})(F?)(?![A-Za-z0-9])/i);
  if (!m) return "";
  const fem = !!m[2] || /(?:^|[^A-Za-z])(?:fem\w*|girls?|ni[ñn]as|mujeres|women)(?![A-Za-z])/i.test(t);
  return "U" + m[1].padStart(2, "0") + (fem ? "F" : "");
}

// Con torneos de categoría en la sala, los que no tienen categoría (la lista
// general, el Rapid) quedan afuera de las cuentas: sus jugadores ya están en
// el de su categoría y se contarían dos veces. La misma regla que normalizar()
// en js/centroamericano-vivo.js.
export function deCategorias<T extends { categoria?: string }>(torneos: T[]): T[] {
  const con = torneos.filter((t) => t.categoria);
  return con.length ? con : torneos;
}

// Lo que hizo un color en una mesa: 1, ½ o 0; null si todavía no hay resultado.
// chess-results escribe «1 - 0», «½ - ½», «0 - 1» y, por incomparecencia,
// «+ - -» o «- - +».
export function puntosDe(resultado: string, blancas: boolean): number | null {
  const m = String(resultado || "").replace(/\s+/g, "").match(/^(1|0|½|\+|-)-(1|0|½|\+|-)$/);
  if (!m) return null;
  const v = (s: string) => (s === "1" || s === "+" ? 1 : s === "½" ? 0.5 : 0);
  return blancas ? v(m[1]) : v(m[2]);
}

export const fmtPuntos = (n: number) => { const e = Math.floor(n), m = n - e >= 0.5; return e ? e + (m ? "½" : "") : (m ? "½" : "0"); };

const conMesas = (t: Torneo) => !!(t.pareo && t.pareo.ronda && Array.isArray(t.pareo.mesas) && t.pareo.mesas.length);

// El resumen de una ronda para los jugadores de un país, en TODOS los torneos
// de la sala juntos: uno por ronda, no uno por categoría (con doce torneos
// serían doce avisos). Sale cuando terminaron todas sus partidas de la ronda
// más alta emparejada; un torneo que va atrás (todavía no emparejó esa ronda)
// lo hace esperar, salvo que ya haya jugado su última ronda (un Round Robin de
// pocos jugadores termina antes). null mientras falte algo.
export function resumenDelegacion(idioma: string, fed: string, torneos: Torneo[]) {
  const suyosDe = (t: Torneo) => new Set((t.jugadores || []).filter((x) => x.fed === fed).map((x) => x.no));
  const deEllos = torneos.filter((t) => suyosDe(t).size);
  const ronda = Math.max(0, ...deEllos.filter(conMesas).map((t) => t.pareo!.ronda));
  if (!ronda) return null;
  let g = 0, e = 0, p = 0, b = 0, pts = 0;
  for (const t of deEllos) {
    if (!conMesas(t) || t.pareo!.ronda !== ronda) {
      const hasta = conMesas(t) ? t.pareo!.ronda : Number(t.ronda) || 0;
      if (!conMesas(t) || (t.rondas && hasta >= t.rondas)) continue; // terminado
      return null; // va atrás: todavía le falta esta ronda
    }
    const suyos = suyosDe(t);
    for (const m of t.pareo!.mesas) {
      for (const [lado, blancas] of [[m.blancas, true], [m.negras, false]] as const) {
        if (!lado || !suyos.has(lado.no)) continue;
        if (!m.negras) { b++; continue; }
        const x = puntosDe(m.resultado, blancas);
        if (x === null) return null;
        pts += x;
        if (x === 1) g++; else if (x === 0.5) e++; else p++;
      }
    }
  }
  const jugadas = g + e + p;
  if (!jugadas && !b) return null;
  const en = idioma === "en";
  const partes = en
    ? [[g, g === 1 ? " win" : " wins"], [e, e === 1 ? " draw" : " draws"], [p, p === 1 ? " loss" : " losses"], [b, b === 1 ? " bye" : " byes"]]
    : [[g, g === 1 ? " ganada" : " ganadas"], [e, " en tablas"], [p, p === 1 ? " perdida" : " perdidas"], [b, " bye"]];
  const lista = (partes as [number, string][]).filter(([n]) => n).map(([n, x]) => n + x).join(", ");
  return {
    ronda,
    titulo: fed + (en ? " · Round " : " · Ronda ") + ronda,
    cuerpo: lista + (jugadas ? (en ? ": " + fmtPuntos(pts) + " of " + jugadas + " points in their games." : ": " + fmtPuntos(pts) + " de " + jugadas + " puntos en sus partidas.") : "."),
  };
}
