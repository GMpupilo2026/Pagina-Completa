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
export const ganar = (cp: number) => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
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
export const VERSION_ANALISIS = 3;   // sube cuando cambia lo que se mide: lo analizado antes se vuelve a analizar
export const MULTIPV = 5;             // cuántas opciones del motor por posición (el modelo por jugada las necesita)
export const PROFUNDIDAD = 12, PROFUNDIDAD_HONDA = 16;   // fija, para que dos computadoras den lo mismo; la honda, para confirmar
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
  forzada: boolean; dificil: boolean; segundos: number | null; antes: number; despues: number; tras_levantarse: boolean;
  deltas: number[]; n_legales: number; delta_jugada: number };
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
//   - deltas: cuánto peor es cada opción del motor que la mejor, en puntos de probabilidad de ganar (la fórmula de
//     Lichess: 0 a 100) para quien mueve; delta_jugada, lo mismo para lo que se jugó. Es lo que usa el modelo.
// «inicio»: desde qué jugada se mide (por omisión, la DESDE_JUGADA de cada uno; con la teoría de la apertura conocida,
// desde la primera jugada que ya no está en las partidas de maestros, nunca antes de la 5.ª de cada uno).
export function detallar(plies: Ply[], evals: (number | null)[], opciones: (Opcion[] | null)[], levantadas: { color: string; hora: number }[], inicio = (DESDE_JUGADA - 1) * 2) {
  const jugadas: Detalle[] = [];
  const vacio = (): Resumen => ({ consideradas: 0, t1: 0, top3: 0, dificiles: 0, dificiles_ok: 0, seg_dificil: null, seg_resto: null, tras_levantarse: 0, tras_levantarse_t1: 0, momentos: [] });
  const res: Record<string, Resumen> = { blancas: vacio(), negras: vacio() };
  const tiempos: Record<string, { dif: number[]; resto: number[] }> = { blancas: { dif: [], resto: [] }, negras: { dif: [], resto: [] } };
  for (let j = Math.max(1, inicio); j < plies.length; j++) {
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
    const wMejor = ganar(mejor);
    const deltas = opts.map((o) => Math.round(Math.max(0, wMejor - ganar(s * o[1])) * 10) / 10);
    const d: Detalle = { ply: j, color, san: p.san, uci: p.uci, mejor: opts[0][0], rango, perdida: rango === 1 ? 0 : Math.max(0, Math.min(1000, mejor - jugado)),
      forzada, dificil, segundos: p.segundos, antes: mejor, despues: jugado, tras_levantarse: tras,
      deltas, n_legales: nLegales, delta_jugada: rango === 1 ? 0 : Math.round(Math.max(0, wMejor - ganar(jugado)) * 10) / 10 };
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

// ---- La teoría de la apertura: hasta dónde la partida sigue las de maestros
// La primera jugada que NO está en la base de maestros de Lichess (o que tiene menos de TEORIA_MIN partidas) es donde
// empieza lo que se mide. «buscar(fen)» da lo que contestó el explorador para esa posición (o null si no se sabe):
// { jugadas: [{ uci, w, d, b }] }. Si no se sabe, se corta ahí (y quien llama usa la regla fija de siempre).
export const TEORIA_MIN = 5;
export function finDeTeoria(plies: Ply[], fensAntes: string[], buscar: (fen: string) => { jugadas?: { uci: string; w: number; d: number; b: number }[] } | null | undefined): { fin: number; seguro: boolean } {
  for (let j = 0; j < Math.min(plies.length, 60); j++) {
    const datos = buscar(fensAntes[j]);
    if (!datos) return { fin: j, seguro: false };
    const m = (datos.jugadas || []).find((x) => x.uci === plies[j].uci);
    if (!m || m.w + m.d + m.b < TEORIA_MIN) return { fin: j, seguro: true };
  }
  return { fin: Math.min(plies.length, 60), seguro: true };
}
// Lo que se usa de verdad: con la teoría conocida, desde donde termina (nunca antes de la 5.ª jugada de cada uno);
// si no se supo, la regla fija (desde la 9.ª).
export const inicioDeMedida = (t: { fin: number; seguro: boolean } | null) => (t && t.seguro ? Math.max(8, t.fin) : (DESDE_JUGADA - 1) * 2);
// El FEN que entiende el explorador (y que guarda su caché): las 4 primeras partes, sin la casilla de al paso.
export const fenExplorador = (fen: string) => { const p = String(fen).split(" "); return [p[0], p[1], p[2], "-"].join(" "); };

// ---- El modelo por jugada (al estilo del de Ken Regan, el que usa FIDE)
// Para cada posición, la probabilidad de que alguien elija cada jugada depende de cuánto peor es que la mejor (delta, en
// puntos de probabilidad de ganar): p ∝ exp(−(delta / s)^c). «s» es la sensibilidad: con más Elo, más chica (se le
// escapan menos las diferencias); «c», la consistencia. Las jugadas fuera de las que dio el motor cuentan juntas, cada
// una un poco peor que la última listada. Con eso, en cada posición sale lo esperable (cuántas veces jugaría la primera,
// cuánto perdería) y su variación, y la suma de un jugador dice cuántas desviaciones se aparta de lo normal para su
// nivel. Ver «El modelo por jugada, al estilo de Regan» en docs/decisiones/juegos-y-torneos.md.
export type MovModelo = { deltas: number[]; n: number; rango: number; dj: number; dificil?: boolean };
const OTRAS_EXTRA = 10;
export function probabilidades(deltas: number[], n: number, s: number, c: number): { p: number[]; otras: number; dOtras: number } {
  const k = Math.max(1, Math.min(deltas.length, n));
  const dOtras = (deltas[k - 1] ?? 0) + OTRAS_EXTRA;
  const peso = (d: number) => Math.exp(-Math.pow(Math.max(0, d) / s, c));
  const w = deltas.slice(0, k).map(peso);
  const wOtras = Math.max(0, n - k) * peso(dOtras);
  const tot = w.reduce((a, b) => a + b, 0) + wOtras;
  return { p: w.map((x) => x / tot), otras: wOtras / tot, dOtras };
}
export const sDeElo = (a: number, b: number, elo: number) => Math.exp(a + b * ((elo - 1500) / 400));
function logProb(m: MovModelo, s: number, c: number) {
  const r = probabilidades(m.deltas, m.n, s, c);
  if (m.rango >= 1 && m.rango <= r.p.length) return Math.log(Math.max(1e-9, r.p[m.rango - 1]));
  return Math.log(Math.max(1e-9, r.otras / Math.max(1, m.n - r.p.length)));
}
// La búsqueda de la sección dorada en un intervalo (para ajustar un parámetro a la vez).
function dorada(f: (x: number) => number, a: number, b: number, vueltas = 22) {
  const g = (Math.sqrt(5) - 1) / 2;
  let x1 = b - g * (b - a), x2 = a + g * (b - a), f1 = f(x1), f2 = f(x2);
  for (let i = 0; i < vueltas; i++) {
    if (f1 < f2) { b = x2; x2 = x1; f2 = f1; x1 = b - g * (b - a); f1 = f(x1); }
    else { a = x1; x1 = x2; f1 = f2; x2 = a + g * (b - a); f2 = f(x2); }
  }
  return (a + b) / 2;
}
// Ajusta a, b y c con las jugadas de jugadores con Elo (máxima verosimilitud, un parámetro a la vez, tres vueltas). Con
// muchas jugadas se usa una muestra pareja de MUESTRA_AJUSTE, para no pasarse del tiempo de procesador de la función.
export const MUESTRA_AJUSTE = 3000;
export function ajustar(movs: (MovModelo & { elo: number })[]): { a: number; b: number; c: number; movimientos: number } {
  const paso = Math.max(1, Math.ceil(movs.length / MUESTRA_AJUSTE));
  const m = movs.filter((_, i) => i % paso === 0);
  let a = Math.log(6), b = -0.5, c = 0.8;
  const nll = (aa: number, bb: number, cc: number) => { let t = 0; for (const x of m) t -= logProb(x, sDeElo(aa, bb, x.elo), cc); return t; };
  for (let v = 0; v < 2; v++) {
    a = dorada((x) => nll(x, b, c), -1, 4.5, 14);
    b = dorada((x) => nll(a, x, c), -2.5, 1.5, 14);
    c = dorada((x) => nll(a, b, x), 0.3, 2, 14);
  }
  return { a, b, c, movimientos: m.length };
}
// Solo «s» (con «c» ya ajustado): para un grupo sin Elo (una categoría). Sin el propio jugador, para que si alguien hace
// trampa no se esconda subiendo el promedio de su grupo: se arma la verosimilitud de cada uno en una grilla de valores
// de s y a cada jugador le toca el mejor valor para todos los demás.
export const GRILLA_S = Array.from({ length: 31 }, (_, i) => Math.exp(-1 + (5.5 * i) / 30));
export function sSinElJugador(porJugador: Map<string, MovModelo[]>, c: number): Map<string, number> {
  const ll = new Map<string, number[]>();
  for (const [k, movs] of porJugador) ll.set(k, GRILLA_S.map((s) => movs.reduce((t, x) => t + logProb(x, s, c), 0)));
  const total = GRILLA_S.map((_, i) => [...ll.values()].reduce((t, v) => t + v[i], 0));
  const out = new Map<string, number>();
  for (const [k, v] of ll) {
    let mejor = 0;
    for (let i = 1; i < GRILLA_S.length; i++) if (total[i] - v[i] > total[mejor] - v[mejor]) mejor = i;
    out.set(k, porJugador.size > 1 ? GRILLA_S[mejor] : GRILLA_S[15]);
  }
  return out;
}
// Lo esperable y lo que pasó en un grupo de jugadas: cuántas veces la primera del motor y cuánto perdió (suma de los
// deltas de lo jugado), con su variación según el modelo.
export type Esperado = { n: number; t1: number; eT1: number; vT1: number; dj: number; eDj: number; vDj: number; dificiles: number; t1Dif: number; eT1Dif: number; vT1Dif: number };
export function esperado(movs: MovModelo[], s: number, c: number): Esperado {
  const r: Esperado = { n: 0, t1: 0, eT1: 0, vT1: 0, dj: 0, eDj: 0, vDj: 0, dificiles: 0, t1Dif: 0, eT1Dif: 0, vT1Dif: 0 };
  for (const m of movs) {
    if (m.n <= 1 || !m.deltas.length) continue;
    const pr = probabilidades(m.deltas, m.n, s, c);
    const p1 = pr.p[0];
    let e = pr.otras * pr.dOtras, e2 = pr.otras * pr.dOtras * pr.dOtras;
    pr.p.forEach((p, i) => { e += p * m.deltas[i]; e2 += p * m.deltas[i] * m.deltas[i]; });
    r.n++; r.t1 += m.rango === 1 ? 1 : 0; r.eT1 += p1; r.vT1 += p1 * (1 - p1);
    r.dj += m.dj; r.eDj += e; r.vDj += Math.max(0, e2 - e * e);
    if (m.dificil) { r.dificiles++; r.t1Dif += m.rango === 1 ? 1 : 0; r.eT1Dif += p1; r.vT1Dif += p1 * (1 - p1); }
  }
  return r;
}
// Las desviaciones: de la primera del motor (más es raro), de lo perdido (menos es raro: va dada vuelta) y las dos
// juntas, que se parecen mucho entre sí, divididas por √3 para no contarlas dos veces. «factor» es cuánto más varía la
// gente real que lo que dice el modelo, y «centro», dónde queda la mitad de la gente (salen de los jugadores del
// torneo: con el modelo ajustado en el mismo torneo, lo normal puede quedar un poco corrido). El índice, en la escala
// de Regan: 50 es lo normal y cada 5 puntos es una desviación.
export function zCruda(e: Esperado): number | null {
  const zT1 = e.vT1 > 0 ? (e.t1 - e.eT1) / Math.sqrt(e.vT1) : null;
  const zDj = e.vDj > 0 ? -(e.dj - e.eDj) / Math.sqrt(e.vDj) : null;
  return zT1 != null && zDj != null ? (zT1 + zDj) / Math.sqrt(3) : zT1;
}
export function indice(e: Esperado, factor = 1, centro = 0) {
  const zT1 = e.vT1 > 0 ? (e.t1 - e.eT1) / Math.sqrt(e.vT1) / factor : null;
  const zDj = e.vDj > 0 ? -(e.dj - e.eDj) / Math.sqrt(e.vDj) / factor : null;
  const zDif = e.vT1Dif > 0 ? (e.t1Dif - e.eT1Dif) / Math.sqrt(e.vT1Dif) / factor : null;
  const cruda = zCruda(e);
  const z = cruda == null ? null : (cruda - centro) / factor;
  const r1 = (x: number | null) => (x == null ? null : Math.round(x * 100) / 100);
  return { zT1: r1(zT1), zDj: r1(zDj), zDif: r1(zDif), z: r1(z), roi: z == null ? null : Math.round((50 + 5 * z) * 10) / 10 };
}
// Dónde queda la mitad de la gente y cuánto más varía que el modelo: la mediana de las z de los jugadores y su
// desviación mediana (así un tramposo no las mueve), con el factor nunca menos de 1. Con menos de 8 jugadores, 0 y 1.
export function centroYFactor(zs: number[]): { centro: number; factor: number } {
  if (zs.length < 8) return { centro: 0, factor: 1 };
  const ord = [...zs].sort((a, b) => a - b), med = ord[Math.floor(ord.length / 2)];
  const desv = zs.map((z) => Math.abs(z - med)).sort((a, b) => a - b);
  return { centro: Math.round(med * 100) / 100, factor: Math.max(1, Math.round(1.4826 * desv[Math.floor(desv.length / 2)] * 100) / 100) };
}

// ---- La validación: qué tan confiable es, con los jugadores de verdad
// Alarmas falsas: de los jugadores medidos (casi todos honestos), cuántos pasan cada umbral; lo esperable por azar es
// 2,3 % desde 2 desviaciones y 0,6 % desde 2,5. Detección: a cada jugador se le «hace trampa» en una parte de sus
// jugadas (en cada una, con esa probabilidad, la primera del motor en vez de lo que jugó) y se mira si el índice lo marca. Con una semilla fija: el mismo
// resultado cada vez.
export const UMBRAL_A_MIRAR = 2, UMBRAL_ALTA = 2.5;
function azar(semilla: number) { let t = semilla >>> 0; return () => { t += 0x6d2b79f5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }
export function validar(jugadores: { movs: MovModelo[]; s: number }[], c: number, factor: number, centro = 0, fracciones = [0.1, 0.2, 0.3]) {
  const medibles = jugadores.filter((j) => j.movs.length >= 30);
  const zReal = medibles.map((j) => indice(esperado(j.movs, j.s, c), factor, centro).z ?? 0);
  const pct = (n: number, d: number) => (d ? Math.round((1000 * n) / d) / 10 : null);
  const rnd = azar(20261104);
  const deteccion: Record<string, { a_mirar: number | null; alta: number | null }> = {};
  for (const f of fracciones) {
    let mira = 0, alta = 0, total = 0;
    for (const j of medibles) for (let rep = 0; rep < 3; rep++) {
      const movs = j.movs.map((m) => (m.n > 1 && rnd() < f ? { ...m, rango: 1, dj: 0 } : m));
      const z = indice(esperado(movs, j.s, c), factor, centro).z ?? 0;
      total++; if (z >= UMBRAL_A_MIRAR) mira++; if (z >= UMBRAL_ALTA) alta++;
    }
    deteccion[String(f)] = { a_mirar: pct(mira, total), alta: pct(alta, total) };
  }
  return { jugadores: medibles.length, falsas_a_mirar: pct(zReal.filter((z) => z >= UMBRAL_A_MIRAR).length, zReal.length),
    falsas_alta: pct(zReal.filter((z) => z >= UMBRAL_ALTA).length, zReal.length), esperadas_a_mirar: 2.3, esperadas_alta: 0.6, deteccion };
}

// La clave de un nombre, IGUAL que interno.fp_clave() en la base: minúsculas, sin tildes, sin comas ni puntos.
export const claveDe = (p: unknown) => String(p ?? "").toLowerCase().replace(/[áéíóúüñ,.]/g, (x) => ({ "á": "a", "é": "e", "í": "i", "ó": "o", "ú": "u", "ü": "u", "ñ": "n", ",": " ", ".": " " } as Record<string, string>)[x]).replace(/\s+/g, " ").trim();
