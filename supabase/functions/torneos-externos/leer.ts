// Leer los torneos próximos de ajedrezcostarica.com, sin red: solo el HTML
// que llegó. Lo usa la Edge Function torneos-externos (ver su cabecera) y lo
// prueba herramientas/verificar-torneos-externos.js con Node contra páginas
// escritas con la misma forma, por eso no importa nada.
//
// Las dos páginas son de Next.js: lo que se ve viene también como JSON dentro
// de sus <script>, con las comillas escapadas (\"). Se quitan las barras y se
// lee con expresiones, no con JSON.parse: ese JSON viene partido en pedazos.
//
//   /es/tournaments            → la portada: los torneos próximos, cada uno
//                                con "href":"/es/tournaments/<n>" y, después,
//                                "start"/"end" (las fechas de su tarjeta).
//   /es/tournaments/<n>        → la ficha: "tournament":{"id":"<n>","details":
//                                {"title",...},"gameTime",...,"organization",...}
//
// Los números de la ficha se leyeron comparándolos con lo que la página
// muestra (23/10/2026): ritmo 1 bala, 2 blitz, 3 rápido, 4 clásico; Elo 1 sin
// Elo, 2 nacional, 3 FIDE, 4 FIDE y nacional; modalidad 1 presencial, 2 en
// línea; formato 1 individual, 2 equipos; region, la provincia (1 San José…
// 7 Limón). Si mañana cambian su HTML, esto devuelve null o una lista vacía
// (nunca un torneo inventado) y el verificador es el que avisa.
//
// Nunca se lee lo que no se va a mostrar: la ficha trae, por ejemplo, los
// correos de quien organiza y las instrucciones de pago, y eso no se toca.

export type TarjetaLista = { id: number; inicio: string | null; fin: string | null };
export type TorneoExterno = {
  id: number; titulo: string; inicio: string | null; fin: string | null;
  provincia: string; lugar: string; ritmo: string; minutos: number | null; incremento: number | null;
  elo: string; precio: number | null; moneda: string; modalidad: string; formato: string;
  organizador: string; organizadorVerificado: boolean; inscripcionAbierta: boolean; chessResults: string;
};

const PROVINCIAS = ["", "San José", "Alajuela", "Cartago", "Heredia", "Guanacaste", "Puntarenas", "Limón"];
const RITMOS = ["", "bala", "blitz", "rapido", "clasico"];
const ELOS = ["", "no", "nacional", "fide", "ambos"];
const FECHA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

const sinBarras = (html: string) => String(html || "").replace(/\\/g, "");
const fecha = (x: string | undefined) => (x && FECHA.test(x) ? x : null);
const corto = (x: string | undefined, max: number) => String(x ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** La portada: qué torneos hay y las fechas de su tarjeta, en el orden en que salen. */
export function leerLista(html: string): TarjetaLista[] {
  const t = sinBarras(html);
  const re = /"href":"\/es\/tournaments\/(\d+)"/g;
  const posiciones: { id: number; desde: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) posiciones.push({ id: Number(m[1]), desde: m.index });
  const vistos = new Set<number>();
  const out: TarjetaLista[] = [];
  posiciones.forEach((p, i) => {
    if (vistos.has(p.id)) return;
    vistos.add(p.id);
    // Sus fechas, antes del enlace al próximo torneo.
    const hasta = i + 1 < posiciones.length ? posiciones[i + 1].desde : p.desde + 4000;
    const f = t.slice(p.desde, hasta).match(/"start":"([^"]+)","end":"([^"]+)"/);
    out.push({ id: p.id, inicio: f ? fecha(f[1]) : null, fin: f ? fecha(f[2]) : null });
  });
  return out;
}

/** La ficha de un torneo, o null si no se encuentra lo esencial (el nombre). */
export function leerTorneo(html: string, id: number): TorneoExterno | null {
  const t = sinBarras(html);
  const i = t.indexOf(`"tournament":{"id":"${id}","details":{`);
  if (i < 0) return null;
  // Hasta el final de su objeto: "registrationFull" va al cierre.
  const fin = t.indexOf('"registrationFull"', i);
  const v = t.slice(i, fin > i ? fin : i + 20000);
  const de = (re: RegExp) => { const x = v.match(re); return x ? x[1] : undefined; };
  const numero = (re: RegExp) => { const x = de(re); return x != null && /^\d+(\.\d+)?$/.test(x) ? Number(x) : null; };
  const titulo = corto(de(/"details":\{"title":"([^"]*)"/), 160);
  if (!titulo) return null;
  const ritmo = v.match(/"gameTime":\{"gamePace":(\d+),"minutes":(\d+|null),"increment":(\d+|null)/);
  // Del horario: la primera y la última hora (rondas, premiación…).
  const horario = v.slice(v.indexOf('"schedule":['), v.indexOf('"organization":'));
  const horas = [...horario.matchAll(/"schedule":"([^"]+)"/g)].map((x) => fecha(x[1])).filter((x): x is string => !!x).sort();
  const org = v.match(/"organization":\{[^}]*?"name":"([^"]*)"[^}]*?"verified":(true|false)/);
  const cr = de(/"chessResultsUrl":"([^"]*)"/) || "";
  return {
    id,
    titulo,
    inicio: horas[0] ?? null,
    fin: horas[horas.length - 1] ?? null,
    provincia: PROVINCIAS[numero(/"region":(\d+)/) ?? 0] || "",
    lugar: corto(de(/"location":"([^"]*)"/), 200),
    ritmo: ritmo ? RITMOS[Number(ritmo[1])] || "" : "",
    minutos: ritmo && ritmo[2] !== "null" ? Number(ritmo[2]) : null,
    incremento: ritmo && ritmo[3] !== "null" ? Number(ritmo[3]) : null,
    elo: ELOS[numero(/"rating":(\d+)/) ?? 0] || "",
    precio: numero(/"price":(\d+(?:\.\d+)?)/),
    moneda: /^[A-Z]{3}$/.test(de(/"priceCurrency":"([^"]*)"/) || "") ? de(/"priceCurrency":"([^"]*)"/)! : "",
    modalidad: ({ 1: "presencial", 2: "en_linea" } as Record<number, string>)[numero(/"modality":(\d+)/) ?? 0] || "",
    formato: ({ 1: "individual", 2: "equipos" } as Record<number, string>)[numero(/"format":(\d+)/) ?? 0] || "",
    organizador: org ? corto(org[1], 120) : "",
    organizadorVerificado: !!org && org[2] === "true",
    inscripcionAbierta: /"registration":\{"open":true/.test(v),
    // Solo un enlace de chess-results de verdad.
    chessResults: /^https:\/\/(s\d+\.)?chess-results\.com\/[^"'<>\s]*$/.test(cr) ? cr : "",
  };
}
