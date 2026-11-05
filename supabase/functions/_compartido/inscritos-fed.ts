// Dos cosas de los jugadores del Centroamericano que salen de chess-results:
//
// 1. SU FEDERACIÓN (el país), para la banderita al final del nombre. La lista de inscritos (art=0) trae la columna
//    «FED» de cada uno (CRC, GUA, ESA…); los emparejamientos y la pantalla de resultados no. Se lee una vez por torneo y
//    se guarda en la memoria de la función unas horas (los inscritos casi no cambian): `fedsDe`. Si chess-results no
//    contesta, no hay banderas, pero nada más se afecta.
//
// 2. LAS MESAS SIN RIVAL. En la pantalla de resultados, cuando alguien se retiró del torneo el rival no es una persona sino
//    una palabra («ausgeschieden», alemán de «retirado»; también «bye», «spielfrei»…). Esa mesa no es una partida: no se
//    muestra ni se cuenta (`sinRival`, `conRival`).
//
// Sin nada de Deno al cargarse, para que herramientas/verificar-centroamericano-banderas.js lo pruebe con node.
// Ver «Banderas y mesas sin rival» en docs/decisiones/juegos-y-torneos.md.

// Las palabras que chess-results pone donde iría el rival cuando no hay uno. Si aparece otra, se agrega aquí.
export const SIN_RIVAL = /^(ausgeschieden|bye|spielfrei|freilos|libre|exento|exenta|descansa|retirad[oa]|withdrawn|sin emparejar|no emparejad[oa]|not paired|unpaired|n\/a)$/i;

export function sinRival(nombre: unknown): boolean {
  const t = String(nombre ?? "").replace(/\s+/g, " ").trim();
  return !t || !/\p{L}/u.test(t) || SIN_RIVAL.test(t);
}

export const conRival = <T extends { blancas: string; negras: string }>(mesas: T[]): T[] =>
  mesas.filter((m) => !sinRival(m.blancas) && !sinRival(m.negras));

// «Ramos Rodríguez, Daniel» (la lista) y «Ramos Rodriguez Daniel» (la pantalla de resultados) son la misma clave.
export const claveNombre = (s: unknown): string =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9ñ]+/g, " ").trim();

const sinEtiquetas = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();

// La lista de inscritos (art=0): la columna «Nombre»/«Name» y la «FED». Devuelve clave del nombre → código de FIDE.
export function fedsDeHtml(html: string): Map<string, string> {
  const out = new Map<string, string>();
  const i = html.indexOf('class="CRs1"');
  if (i < 0) return out;
  const tabla = html.slice(i, html.indexOf("</table>", i) < 0 ? undefined : html.indexOf("</table>", i));
  const filas = tabla.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? [];
  let iNombre = -1, iFed = -1;
  for (const f of filas) {
    const celdas = (f.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/g) ?? []).map(sinEtiquetas);
    if (iFed < 0) {
      const n = celdas.findIndex((c) => /^(nombre|name|nom)$/i.test(c)), g = celdas.findIndex((c) => /^fed$/i.test(c));
      if (n >= 0 && g >= 0) { iNombre = n; iFed = g; }
      continue;
    }
    const nombre = celdas[iNombre], fed = (celdas[iFed] ?? "").toUpperCase();
    if (nombre && /^[A-Z]{3}$/.test(fed)) out.set(claveNombre(nombre), fed);
  }
  return out;
}

export const fedDe = (mapa: Map<string, string> | null | undefined, nombre: unknown): string | null => (mapa && mapa.get(claveNombre(nombre))) || null;

// ---- la lectura, con su memoria
const VIGENCIA_MS = 3 * 3600_000, REINTENTO_MS = 60_000;
const memoria = new Map<string, { al: number; vence: number; mapa: Map<string, string> }>();
const enCurso = new Map<string, Promise<Map<string, string>>>();

export function fedsDe(tnr: string, esperaMs = 6000): Promise<Map<string, string>> {
  const m = memoria.get(tnr);
  if (m && Date.now() < m.vence) return Promise.resolve(m.mapa);
  if (!/^\d{4,9}$/.test(tnr)) return Promise.resolve(new Map());
  const ya = enCurso.get(tnr);
  if (ya) return ya;
  const p = (async () => {
    try {
      const r = await fetch("https://s3.chess-results.com/tnr" + tnr + ".aspx?lan=2&art=0&zeilen=0", { headers: { "User-Agent": "Mozilla/5.0 (compatible; AjedrezIntegral)" }, signal: AbortSignal.timeout(esperaMs) });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const mapa = fedsDeHtml(await r.text());
      if (!mapa.size) throw new Error("sin columna FED");
      memoria.set(tnr, { al: Date.now(), vence: Date.now() + VIGENCIA_MS, mapa });
      return mapa;
    } catch (e) {
      console.error("inscritos-fed: no se pudo leer", tnr, e instanceof Error ? e.message : String(e));
      // Sin lista nueva, se sigue con la última que hubo (aunque vieja) y no se vuelve a intentar durante un minuto.
      const mapa = m ? m.mapa : new Map<string, string>();
      memoria.set(tnr, { al: m ? m.al : Date.now(), vence: Date.now() + REINTENTO_MS, mapa });
      return mapa;
    } finally {
      enCurso.delete(tnr);
    }
  })();
  enCurso.set(tnr, p);
  return p;
}
