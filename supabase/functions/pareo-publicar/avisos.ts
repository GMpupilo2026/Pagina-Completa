// Los avisos a quien sigue a un jugador por correo: qué cambió entre la
// versión anterior de un torneo publicado y la nueva, y qué le toca al
// jugador en la ronda nueva. Lo usa pareo-publicar al crear y al poner al día
// un torneo; lo prueba herramientas/verificar-pareo-seguir-correo.js con Node,
// por eso no importa nada. Ver «Torneos en Pareo Integral: avisar por correo
// a quien sigue a un jugador» en docs/decisiones/juegos-y-torneos.md.

type Obj = Record<string, unknown>;
type Mesa = { b: string; n: string | null; r: string | null };
type Ronda = { mesas: Mesa[]; ausencias?: Record<string, string> };
export type TorneoAviso = {
  nombre?: string; grupo?: string; tipo?: string; rondasTotales?: number; mesaInicial?: number;
  jugadores: { id: string; nombre: string; elo?: number }[]; rondas: Ronda[];
  resumen?: { id: string; puesto: number; puntos: number; rondas: number }[];
};

// Una ronda está completa si todas sus mesas tienen resultado (o son un bye).
const completa = (R: Ronda) => R.mesas.length > 0 && R.mesas.every((m) => m.r || m.n === null);
export const rondasCompletas = (t: TorneoAviso | null) => (t ? t.rondas.filter(completa).length : 0);

/** Qué hay para avisar: la ronda nueva emparejada (su número) y si el torneo
    acaba de terminar. Nada en un torneo por equipos (ahí juegan equipos). */
export function queAvisar(antes: TorneoAviso | null, ahora: TorneoAviso): { ronda: number | null; fin: boolean } {
  if (ahora.tipo === "equipos") return { ronda: null, fin: false };
  const n0 = antes ? antes.rondas.filter((R) => R.mesas.length).length : 0;
  const n = ahora.rondas.filter((R) => R.mesas.length).length;
  const total = Number(ahora.rondasTotales) || 0;
  const fin = total > 0 && rondasCompletas(ahora) >= total && rondasCompletas(antes) < total;
  return { ronda: n > n0 ? n : null, fin };
}

/** Lo que le toca a un jugador en la ronda r (desde 0). */
export function suRonda(t: TorneoAviso, jid: string, r: number):
  { tipo: "partida"; mesa: number; color: "blancas" | "negras"; rival: string; elo: number } | { tipo: "libre" | "ausente" | "nada" } {
  const R = t.rondas[r];
  if (!R) return { tipo: "nada" };
  if (R.ausencias && R.ausencias[jid]) return { tipo: "ausente" };
  const i = R.mesas.findIndex((m) => m.b === jid || m.n === jid);
  if (i < 0) return { tipo: "nada" };
  const m = R.mesas[i];
  if (m.n === null) return { tipo: "libre" };
  const rivalId = m.b === jid ? m.n : m.b;
  const rival = t.jugadores.find((j) => j.id === rivalId);
  const inicial = Number(t.mesaInicial) > 1 ? Math.floor(Number(t.mesaInicial)) : 1;
  return { tipo: "partida", mesa: inicial + i, color: m.b === jid ? "blancas" : "negras", rival: rival ? rival.nombre : "?", elo: Number(rival && rival.elo) || 0 };
}

const puntos = (x: number) => {
  const n = Math.floor(x), m = x - n;
  return (n || !m ? String(n) : "") + (Math.abs(m - 0.5) < 1e-9 ? "½" : "");
};

/** El texto del aviso de una ronda (una línea, sin HTML: lo escapa quien lo pinta). */
export function textoRonda(t: TorneoAviso, jid: string, nombre: string, r: number): string {
  const s = suRonda(t, jid, r);
  const torneo = t.grupo || t.nombre || "el torneo";
  if (s.tipo === "partida") return `${nombre} juega la ronda ${r + 1} de «${torneo}»: mesa ${s.mesa}, con ${s.color}, contra ${s.rival}${s.elo ? " (" + s.elo + ")" : ""}.`;
  if (s.tipo === "libre") return `${nombre} queda libre en la ronda ${r + 1} de «${torneo}».`;
  if (s.tipo === "ausente") return `${nombre} no juega la ronda ${r + 1} de «${torneo}».`;
  return "";
}

/** El texto del aviso del final: su puesto y sus puntos. */
export function textoFin(t: TorneoAviso, jid: string, nombre: string): string {
  const f = (t.resumen || []).find((x) => x.id === jid);
  const torneo = t.grupo || t.nombre || "el torneo";
  if (!f) return `Terminó «${torneo}».`;
  const de = (t.resumen || []).length;
  return `${nombre} terminó «${torneo}» en el puesto ${f.puesto} de ${de}, con ${puntos(f.puntos)} ${f.puntos === 1 ? "punto" : "puntos"}.`;
}

export const esTorneoAviso = (v: unknown): v is TorneoAviso =>
  typeof v === "object" && v !== null && Array.isArray((v as Obj).jugadores) && Array.isArray((v as Obj).rondas);
