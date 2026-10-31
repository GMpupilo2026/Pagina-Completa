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

// La modalidad que dice el texto de un enlace de la sala: «Blitz Sub-10
// Absoluto» → «blitz», «Rápidas Sub-12 Femenino» o «Rapid U12» → «rapidas»;
// sin ninguna de las dos, «clasico». La página muestra una modalidad a la vez
// (el selector «Clásico · Rápidas · Blitz») y la función lee solo esa. Ver
// «Rápidas y Blitz: una modalidad a la vez» en docs/decisiones/juegos-y-torneos.md.
export const MODALIDADES = ["clasico", "rapidas", "blitz"] as const;
export type Modalidad = typeof MODALIDADES[number];
export function modalidadDe(texto: string): Modalidad {
  const t = String(texto || "");
  if (/(?:^|[^A-Za-z])blitz(?![A-Za-z])/i.test(t)) return "blitz";
  if (/(?:^|[^A-Za-zÀ-ÿ])r[aá]pid[oa]?s?(?![A-Za-z])/i.test(t)) return "rapidas";
  return "clasico";
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

// ---- «su partida está en vivo»: el aviso cuando la partida de un seguido
// empieza en un tablero que Lichess transmite. Ver «Su partida está en vivo:
// el aviso al celular» en docs/decisiones/juegos-y-torneos.md.

// lichess.org/broadcast/<torneo>/<id> → un torneo; /<torneo>/<ronda>/<id>
// (con la partida al final o no) → una ronda. La misma regla que idDeEnlace()
// de js/lichess-transmision.js.
export function idDeEnlaceLichess(url: string): { id: string; es: "torneo" | "ronda" } | null {
  let u: URL;
  try { u = new URL(String(url || "")); } catch { return null; }
  if (!/(^|\.)lichess\.org$/.test(u.hostname)) return null;
  const p = u.pathname.split("/").filter(Boolean);
  if (p[0] !== "broadcast") return null;
  const ok = (s?: string) => /^[A-Za-z0-9]{8}$/.test(s || "");
  if (p.length === 3 && ok(p[2])) return { id: p[2], es: "torneo" };
  if ((p.length === 4 || p.length === 5) && ok(p[3])) return { id: p[3], es: "ronda" };
  return null;
}

// La misma persona en chess-results y en Lichess (los dos escriben
// «Apellidos, Nombre» de FIDE): igual sin tildes ni mayúsculas, o con los
// mismos apellidos y el mismo primer nombre. La regla de partidaDe() en
// js/centroamericano-partidas.js.
const sinTildes = (s: string) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const apellidosYNombre = (n: string) => { const [a, b] = String(n || "").split(","); return sinTildes(a) + "|" + sinTildes(b || "").split(" ")[0]; };
export const mismoNombre = (a: string, b: string) => !!a && !!b && (sinTildes(a) === sinTildes(b) || apellidosYNombre(a) === apellidosYNombre(b));

export type PartidaLichess = { id: string; ronda: number; categoria: string; mesa: number; blancas: string; negras: string; empezada: boolean; terminada: boolean };

// La partida que juega ahora alguien de esa categoría y esa ronda: empezada
// (ya tiene una jugada) y sin terminar. Si hay dos que calzan (dos personas
// con el mismo nombre), ninguna: mejor no avisar que avisar de otra.
export function partidaEnVivo(partidas: PartidaLichess[], nombre: string, categoria: string, ronda: number): { p: PartidaLichess; color: "w" | "b" } | null {
  const calzan = partidas.filter((p) => p.empezada && !p.terminada &&
    (!categoria || !p.categoria || p.categoria === categoria) && (!ronda || !p.ronda || p.ronda === ronda) &&
    (mismoNombre(p.blancas, nombre) || mismoNombre(p.negras, nombre)));
  if (calzan.length !== 1) return null;
  return { p: calzan[0], color: mismoNombre(calzan[0].blancas, nombre) ? "w" : "b" };
}
