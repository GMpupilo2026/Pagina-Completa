// Lo que la Edge Function centroamericano-fair-play calcula sin red ni Deno: leer los emparejamientos de una
// ronda de chess-results, reconocer las partidas de LiveChess (el tablero, los nombres, el resultado) y sacar la
// precisión de cada jugador de la evaluación de cada posición. Sin nada de Deno, para que
// herramientas/verificar-centroamericano-fair-play.js lo pruebe con node.
// Ver «El sorteo de Fair Play» y «Las partidas para Fair Play, directo de LiveChess» en docs/decisiones/juegos-y-torneos.md.

export type Pareo = { mesa: number; snr_b: number | null; snr_n: number | null; blancas: string; negras: string; elo_b: number | null; elo_n: number | null; resultado: string };

const sinEtiquetas = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&frac12;|&#189;|&#xbd;/gi, "½").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
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

// ---- LiveChess Cloud (los tableros electrónicos, sin atraso)
// Los nombres: la MISMA regla que supabase/functions/centroamericano-mesas-vivo/index.ts y
// js/centroamericano-transmision-reloj.js (verificar-centroamericano-fair-play.js comprueba que dice lo mismo).
const palabras = (s: unknown) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-zñ0-9\s]/g, " ").split(/\s+/).filter((x) => x.length > 1);
export function mismoJugador(a: unknown, b: unknown) {
  const pa = new Set(palabras(a)), pb = palabras(b);
  if (!pa.size || !pb.length) return false;
  const comunes = pb.filter((x) => pa.has(x)).length;
  return comunes >= 2 || (comunes >= 1 && Math.min(pa.size, pb.length) === 1);
}

// «Guevara Ruiz, Santiago» de chess-results contra { fname, mname, lname } de LiveChess.
// deno-lint-ignore no-explicit-any
export const nombreLc = (p: any) => [p?.lname, p?.fname, p?.mname].filter(Boolean).join(" ");
export const RESULTADO_LC: Record<string, string> = { WHITEWIN: "1-0", BLACKWIN: "0-1", DRAW: "1/2-1/2" };

// Los tableros que transmite una categoría: «1-5», «1-3, 7».
export function tablerosDe(t: string): number[] {
  const out = new Set<number>();
  for (const parte of String(t || "").split(",")) {
    const m = parte.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!m) continue;
    for (let i = Number(m[1]); i <= Number(m[2] || m[1]) && i <= 200; i++) out.add(i);
  }
  return [...out].sort((a, b) => a - b);
}

// Una partida de LiveChess que ya terminó en el índice de su ronda: su resultado y que no siga en vivo.
// deno-lint-ignore no-explicit-any
export const terminadaLc = (p: any) => !!p && !p.live && /^(1-0|0-1|1\/2-1\/2|½-½)$/.test(String(p.result || ""));

// Las jugadas de LiveChess traen el reloj y lo pensado: «Nf3 5482+5». Solo la jugada.
export const sanDe = (jugada: unknown) => String(jugada || "").trim().split(/\s+/)[0];

// ¿Es la partida de la ronda anterior en el mismo tablero? Pasó de verdad (Sub-8, tablero 4, rondas 4 y 5): LiveChess
// trae los nombres nuevos en el pareo, pero las jugadas de la ronda anterior porque el tablero no se limpió. Dos
// partidas distintas no repiten 40 jugadas seguidas desde el principio; una copia, sí (entera, o la vieja y lo que siguió).
export function copiaDeOtra(a: unknown[], b: unknown[]): boolean {
  const x = (a || []).map(sanDe), y = (b || []).map(sanDe);
  const corta = Math.min(x.length, y.length);
  if (!corta) return false;
  for (let i = 0; i < corta; i++) if (x[i] !== y[i]) return false;
  return x.length === y.length || corta >= 40;
}

// Desde qué posición hace falta la evaluación: medir() mira cada jugada desde la DESDE_JUGADA de cada uno, y la
// evaluación de la posición de antes; las anteriores no se usan (se mandan en null).
export const DESDE_POSICION = (DESDE_JUGADA - 1) * 2 - 1;

// La evaluación que manda la pantalla: una por posición (en centipeones, para las blancas; un mate ±10000), null
// antes de DESDE_POSICION. Lo que no sea eso se rechaza entero.
export function evalsValidas(evals: unknown, posiciones: number): (number | null)[] | null {
  if (!Array.isArray(evals) || evals.length !== posiciones) return null;
  const out: (number | null)[] = [];
  for (let i = 0; i < evals.length; i++) {
    const e = evals[i];
    if (e == null) { out.push(null); continue; }
    if (typeof e !== "number" || !Number.isFinite(e) || Math.abs(e) > 10000) return null;
    out.push(Math.round(e));
  }
  return out;
}
