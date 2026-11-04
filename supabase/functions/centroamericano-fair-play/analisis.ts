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

// ---- Fase 1 del detector: cada jugada con las 3 mejores del motor, la dificultad y el tiempo
// Ver «El detector de Fair Play, jugada por jugada» en docs/decisiones/juegos-y-torneos.md.
export const VERSION_ANALISIS = 2;   // sube cuando cambia lo que se mide: lo analizado antes se vuelve a analizar
export const VENTANA_LEVANTO_MS = 5 * 60_000;   // las jugadas de los 5 minutos después de que el árbitro anotó «se levantó»

// Lo que pensó en una jugada de LiveChess: «Nf3 5482+5» son 5 segundos (5482 es su reloj).
export function segundosDe(jugada: unknown): number | null {
  const m = String(jugada || "").match(/\s\d+\+(\d+)\s*$/);
  return m ? Number(m[1]) : null;
}

// Las opciones del motor para una posición: [jugada en UCI, centipeones para las blancas], la mejor primero.
export type Opcion = [string, number];
const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
export function opcionesValidas(opciones: unknown, posiciones: number): (Opcion[] | null)[] | null {
  if (!Array.isArray(opciones) || opciones.length !== posiciones) return null;
  const out: (Opcion[] | null)[] = [];
  for (const o of opciones) {
    if (o == null) { out.push(null); continue; }
    if (!Array.isArray(o) || o.length > 5) return null;
    const lista: Opcion[] = [];
    for (const x of o) {
      if (!Array.isArray(x) || !UCI.test(String(x[0])) || typeof x[1] !== "number" || !Number.isFinite(x[1]) || Math.abs(x[1]) > 10000) return null;
      lista.push([String(x[0]), Math.round(x[1])]);
    }
    out.push(lista);
  }
  return out;
}

// Una jugada de la partida, como la arma la función con chess.js: lo jugado, las jugadas que había (con si eran
// captura o jaque), lo que pensó y a qué hora se hizo.
export type Ply = { san: string; uci: string; legales: Record<string, { captura: boolean; jaque: boolean }>; segundos: number | null; hora: number | null };
export type Detalle = { ply: number; color: "blancas" | "negras"; san: string; uci: string; mejor: string | null; rango: number; perdida: number;
  forzada: boolean; dificil: boolean; segundos: number | null; antes: number; despues: number; tras_levantarse: boolean };
export type Resumen = { consideradas: number; t1: number; top3: number; dificiles: number; dificiles_ok: number;
  seg_dificil: number | null; seg_resto: number | null; tras_levantarse: number; tras_levantarse_t1: number;
  momentos: { jugada: number; san: string; segundos: number | null }[] };

// Jugada por jugada, desde la DESDE_JUGADA de cada uno y sin las posiciones ya decididas (lo mismo que medir()):
//   - rango: en qué lugar de las 3 del motor quedó lo jugado (0 = ninguna de las 3);
//   - forzada: no había nada que pensar (una sola jugada legal, o la mejor es una captura y la segunda pierde 3 peones):
//     no cuenta para la coincidencia con el motor;
//   - difícil: una sola jugada buena (la segunda pierde 1 peón o más) y no es un jaque ni una captura: la que un humano
//     suele no ver. Acertarlas una y otra vez es lo raro;
//   - tras_levantarse: la hizo en los 5 minutos después de que el árbitro anotó que se levantó de la mesa.
export function detallar(plies: Ply[], evals: (number | null)[], opciones: (Opcion[] | null)[], levantadas: { color: string; hora: number }[]) {
  const jugadas: Detalle[] = [];
  const vacio = (): Resumen => ({ consideradas: 0, t1: 0, top3: 0, dificiles: 0, dificiles_ok: 0, seg_dificil: null, seg_resto: null, tras_levantarse: 0, tras_levantarse_t1: 0, momentos: [] });
  const res: Record<string, Resumen> = { blancas: vacio(), negras: vacio() };
  const tiempos: Record<string, { dif: number[]; resto: number[] }> = { blancas: { dif: [], resto: [] }, negras: { dif: [], resto: [] } };
  for (let j = (DESDE_JUGADA - 1) * 2; j < plies.length; j++) {
    const opts = opciones[j - 1], previa = evals[j - 1], ahora = evals[j], p = plies[j];
    if (!p || !opts || !opts.length || previa == null || ahora == null || Math.abs(previa) >= DECIDIDA_CP) continue;
    const color = j % 2 === 0 ? "blancas" : "negras", s = color === "blancas" ? 1 : -1;
    const mejor = s * opts[0][1], segunda = opts[1] ? s * opts[1][1] : null, jugado = s * ahora;
    const rango = opts.findIndex((o) => o[0] === p.uci) + 1;
    const datosMejor = p.legales[opts[0][0]] || { captura: false, jaque: false };
    const nLegales = Object.keys(p.legales).length;
    const forzada = nLegales === 1 || (segunda != null && mejor - segunda >= 300 && datosMejor.captura);
    const dificil = !forzada && segunda != null && mejor - segunda >= 100 && !datosMejor.captura && !datosMejor.jaque;
    const tras = levantadas.some((l) => l.color === color && p.hora != null && p.hora >= l.hora && p.hora - l.hora <= VENTANA_LEVANTO_MS);
    const d: Detalle = { ply: j, color, san: p.san, uci: p.uci, mejor: opts[0][0], rango, perdida: rango === 1 ? 0 : Math.max(0, Math.min(1000, mejor - jugado)),
      forzada, dificil, segundos: p.segundos, antes: mejor, despues: jugado, tras_levantarse: tras };
    jugadas.push(d);
    const r = res[color];
    if (!forzada) {
      r.consideradas++;
      if (rango === 1) r.t1++;
      if (rango >= 1 && rango <= 3) r.top3++;
      if (p.segundos != null) (dificil ? tiempos[color].dif : tiempos[color].resto).push(p.segundos);
    }
    if (dificil) {
      r.dificiles++;
      if (rango === 1) { r.dificiles_ok++; r.momentos.push({ jugada: Math.floor(j / 2) + 1, san: p.san, segundos: p.segundos }); }
    }
    if (tras) { r.tras_levantarse++; if (rango === 1 && !forzada) r.tras_levantarse_t1++; }
  }
  const media = (v: number[]) => (v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null);
  for (const c of ["blancas", "negras"]) {
    res[c].seg_dificil = media(tiempos[c].dif);
    res[c].seg_resto = media(tiempos[c].resto);
    // Las tres más llamativas: las difíciles acertadas con menos tiempo.
    res[c].momentos = res[c].momentos.sort((a, b) => (a.segundos ?? 1e9) - (b.segundos ?? 1e9)).slice(0, 3);
  }
  return { jugadas, resumen: res as { blancas: Resumen; negras: Resumen } };
}
