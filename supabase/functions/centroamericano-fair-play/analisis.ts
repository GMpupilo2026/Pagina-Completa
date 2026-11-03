// Lo que la Edge Function centroamericano-fair-play calcula sin red ni Deno: leer los emparejamientos de una
// ronda de chess-results, leer el PGN de una ronda de Lichess y sacar la precisión de cada jugador. Sin nada de
// Deno, para que herramientas/verificar-centroamericano-fair-play.js lo pruebe con node.
// Ver «El sorteo de Fair Play» en docs/decisiones/juegos-y-torneos.md.

export type Pareo = { mesa: number; snr_b: number | null; snr_n: number | null; blancas: string; negras: string; elo_b: number | null; elo_n: number | null; resultado: string };

const sinEtiquetas = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
const numero = (s: string) => (/^\d{3,4}$/.test(s) ? Number(s) : null);

// art=2 de chess-results: «M. | No. | … | Blancas | Elo | Pts. | Resultado | Pts. | … | Negras | Elo | … | No.». Cada jugador
// es un enlace con su número en el torneo (snr=); el Elo es la celda que sigue a su nombre. Una mesa con un solo enlace es
// un bye: negras queda vacío.
export function leerPareos(html: string): Pareo[] {
  const i = html.indexOf('class="CRs1"');
  if (i < 0) return [];
  const tabla = html.slice(i, html.indexOf("</table>", i));
  const filas = tabla.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? [];
  const out: Pareo[] = [];
  for (const f of filas) {
    const celdas = f.match(/<td[^>]*>[\s\S]*?<\/td>/g) ?? [];
    if (!celdas.length) continue;
    const mesa = Number(sinEtiquetas(celdas[0]));
    if (!Number.isInteger(mesa) || mesa < 1) continue;
    const conEnlace = celdas.map((c, k) => ({ c, k })).filter((x) => /snr=\d+/.test(x.c));
    if (!conEnlace.length) continue;
    const b = conEnlace[0], n = conEnlace[1];
    const snr = (c: string) => Number((c.match(/snr=(\d+)/) || [])[1]) || null;
    const textos = celdas.map(sinEtiquetas);
    const entre = textos.slice(b.k + 1, n ? n.k : textos.length);
    const resultado = entre.find((t) => /^(1|0|½|1\/2|\+|-)\s*-\s*(1|0|½|1\/2|\+|-)$/.test(t)) ?? "";
    out.push({
      mesa, snr_b: snr(b.c), snr_n: n ? snr(n.c) : null,
      blancas: textos[b.k], negras: n ? textos[n.k] : "",
      elo_b: numero(textos[b.k + 1] ?? ""), elo_n: n ? numero(textos[n.k + 1] ?? "") : null,
      resultado: resultado.replace(/\s+/g, " "),
    });
  }
  return out;
}

export type Partida = { tags: Record<string, string>; evals: (number | null)[] };

// El PGN de una ronda de Lichess: cada partida con sus etiquetas y la evaluación (en centipeones, para las blancas)
// después de cada jugada; un mate vale ±10000. Sin evaluación, null.
export function leerPgn(texto: string): Partida[] {
  const out: Partida[] = [];
  for (const bloque of texto.split(/\n\s*\n(?=\[Event )/)) {
    const tags: Record<string, string> = {};
    for (const m of bloque.matchAll(/^\[(\w+) "([^"]*)"\]$/gm)) tags[m[1]] = m[2];
    if (!tags.Event) continue;
    const cuerpo = bloque.replace(/^\[.*\]$/gm, "");
    const evals: (number | null)[] = [];
    for (const m of cuerpo.matchAll(/\{([^}]*)\}|(\d+\.(?:\.\.)?)|([^\s{}]+)/g)) {
      if (m[3] && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(m[3])) evals.push(null);
      else if (m[1] != null && evals.length && evals[evals.length - 1] == null) {
        const e = m[1].match(/\[%eval\s+(#?)(-?\d+(?:\.\d+)?)/);
        if (e) evals[evals.length - 1] = e[1] ? (Number(e[2]) > 0 ? 10000 : -10000) : Number(e[2]) * 100;
      }
    }
    out.push({ tags, evals });
  }
  return out;
}

// La fórmula pública de Lichess: la probabilidad de ganar de una evaluación, y la precisión de una jugada según
// cuánto bajó esa probabilidad para quien movió.
const ganar = (cp: number) => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
const precisionJugada = (antes: number, despues: number) => Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * (antes - despues)) - 3.1669));

export type Medida = { jugadas: number; precision: number; acpl: number };
export const DESDE_JUGADA = 9;        // las 8 primeras jugadas de cada uno son de apertura: no dicen nada
export const DECIDIDA_CP = 600;       // con 6 peones de ventaja la partida ya está decidida: tampoco
export const MIN_JUGADAS = 15;

// La precisión media y la pérdida media (ACPL, tope 1000 por jugada) de blancas y negras, sin la apertura ni las
// posiciones ya decididas. Una jugada sin evaluación (antes o después) no cuenta.
export function medir(evals: (number | null)[]): { blancas: Medida; negras: Medida } {
  const acc: Record<string, number[]> = { w: [], b: [] }, pl: Record<string, number[]> = { w: [], b: [] };
  let previa: number | null = 20;   // la posición inicial
  evals.forEach((e, i) => {
    const color = i % 2 === 0 ? "w" : "b";
    if (e == null) { previa = null; return; }
    if (previa != null && i >= (DESDE_JUGADA - 1) * 2 && Math.abs(previa) < DECIDIDA_CP) {
      const s = color === "w" ? 1 : -1;
      acc[color].push(precisionJugada(ganar(s * previa), ganar(s * e)));
      pl[color].push(Math.max(0, Math.min(1000, s * (previa - e))));
    }
    previa = e;
  });
  const media = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);
  const m = (c: string): Medida => ({ jugadas: acc[c].length, precision: Math.round(media(acc[c]) * 100) / 100, acpl: Math.round(media(pl[c]) * 10) / 10 });
  return { blancas: m("w"), negras: m("b") };
}

// La categoría de un torneo de Lichess del grupo («Open U12», «Girls U08») como la escribe centroamericano_torneos
// («Sub-12» y «Absoluto» o «Femenino»).
export function categoriaDeLichess(nombre: string): { categoria: string; rama: string } | null {
  const m = String(nombre || "").match(/\b(Open|Girls?|Women|Boys?)\b[^U]*U\s*0?(\d{1,2})\b/i) || String(nombre || "").match(/U\s*0?(\d{1,2})\b.*\b(Open|Girls?)\b/i);
  if (!m) return null;
  const tipo = /^\d/.test(m[1]) ? m[2] : m[1], edad = /^\d/.test(m[1]) ? m[1] : m[2];
  return { categoria: "Sub-" + Number(edad), rama: /^girl|^women/i.test(tipo) ? "Femenino" : "Absoluto" };
}

// La mesa de una partida de Lichess: «Round "2.5"» es la ronda 2, mesa 5.
export function rondaYMesa(tags: Record<string, string>): { ronda: number; mesa: number } | null {
  const m = String(tags.Round || "").match(/^(\d+)\.(\d+)$/);
  return m ? { ronda: Number(m[1]), mesa: Number(m[2]) } : null;
}
