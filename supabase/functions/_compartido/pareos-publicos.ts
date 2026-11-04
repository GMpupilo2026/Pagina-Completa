// Los emparejamientos PÚBLICOS de una ronda de chess-results (la página «Pareos» de cada torneo, art=2): quién juega con
// blancas, con negras y cómo terminó. Sin clave ni sesión: es lo mismo que ve cualquiera en chess-results.com. Una sola
// copia compartida; se copia a cada función al armarla (herramientas/funciones-armar.js).
//
// La usa centroamericano-mesa («Mis pareos»: completa los resultados de las rondas anteriores del árbitro). La Edge
// Function centroamericano-fair-play tiene su propio `leerPareos` en analisis.ts (no se vuelve a desplegar en pleno torneo);
// verificar-centroamericano-fair-play.js comprueba que los DOS lean igual la misma página, y se unifican al terminar el
// torneo. Ver «Mis pareos» en docs/decisiones/juegos-y-torneos.md.
//
// NO ES UN PROXY ABIERTO: solo pide chess-results.com (s3.chess-results.com/tnr<número>.aspx), con el torneo y la ronda
// validados como números.

export type Pareo = { mesa: number; snr_b: number | null; snr_n: number | null; blancas: string; negras: string; elo_b: number | null; elo_n: number | null; resultado: string };

const sinEtiquetas = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&frac12;|&#189;|&#xbd;/gi, "½").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
// chess-results escribe las tablas como «&frac12; - &frac12;» (una entidad HTML): sin decodificarla toda partida en tablas salía
// sin resultado.
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

// Pide la página de una ronda y la lee. Lanza un Error si chess-results no contesta bien.
export async function pareosPublicos(tnr: string, ronda: number, ms = 8000): Promise<Pareo[]> {
  if (!/^\d{1,8}$/.test(tnr) || !Number.isInteger(ronda) || ronda < 1 || ronda > 99) throw new Error("Torneo o ronda no válidos.");
  const r = await fetch("https://s3.chess-results.com/tnr" + tnr + ".aspx?lan=2&art=2&rd=" + ronda + "&SNode=S0", {
    headers: { "User-Agent": "AjedrezIntegral-MisPareos/1.0" }, signal: AbortSignal.timeout(ms),
  });
  if (!r.ok) throw new Error("chess-results contestó " + r.status + ".");
  return leerPareos(await r.text());
}
