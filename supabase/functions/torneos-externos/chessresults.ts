// Leer el buscador de torneos de chess-results, sin red: solo el HTML que
// llegó. Lo usa la Edge Function torneos-externos (ver su cabecera) y lo
// prueba herramientas/verificar-torneos-externos.js con Node, por eso no
// importa nada.
//
// Es la misma lectura que herramientas/ajedrez-estudiantil-actualizar.py: el
// formulario ASP.NET del buscador (TurnierSuche.aspx) con Costa Rica y «los
// tocados más recientemente», y la tabla de resultados (class="CRs2") leída
// por el NOMBRE de cada columna, nunca por la posición: chess-results ya
// cambió columnas antes. Si la tabla no tiene las columnas de siempre,
// devuelve null (no una lista vacía): la función no toca nada y lo dice.
//
// Ver «Torneos en Pareo Integral: los torneos de chess-results» en
// docs/decisiones/juegos-y-torneos.md.

export type FilaCR = { id: number; titulo: string; inicio: string; organizador: string; lugar: string; rondas: number; jugadores: number };

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };
const desEntidad = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === "#") {
    const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
  }
  return ENTIDADES[e.toLowerCase()] ?? m;
});
export const textoCelda = (c: string) => desEntidad(c.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

/** Los <input type="hidden"> del formulario (__VIEWSTATE y compañía). */
export function camposOcultos(pagina: string): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const m of pagina.matchAll(/<input type="hidden" name="([^"]+)" id="[^"]*" value="([^"]*)"/g)) salida[m[1]] = desEntidad(m[2]);
  return salida;
}

/** Lo que se le manda al buscador: Costa Rica, los más recientes, 250 filas. */
export function formularioBusqueda(ocultos: Record<string, string>): Record<string, string> {
  return {
    ...ocultos,
    "ctl00$P1$txt_leiter": "", "ctl00$P1$combo_art": "5", "ctl00$P1$combo_sort": "1",
    "ctl00$P1$combo_land": "CRC", "ctl00$P1$combo_bedenkzeit": "0", "ctl00$P1$combo_anzahl_zeilen": "1",
    "ctl00$P1$txt_tnr": "", "ctl00$P1$txt_bez": "", "ctl00$P1$txt_veranstalter": "",
    "ctl00$P1$txt_Hauptschiedsrichter": "", "ctl00$P1$txt_Schiedsrichter": "", "ctl00$P1$txt_ort": "",
    "ctl00$P1$txt_von_tag": "", "ctl00$P1$txt_bis_tag": "", "ctl00$P1$txt_eventid": "",
    "ctl00$P1$cb_suchen": "Buscar",
  };
}

const COLUMNAS = ["Torneo", "Del", "Organizador", "Lugar", "Rd.", "n", "dbkey"];

/** Las filas de la tabla de resultados; null si la tabla cambió de forma. */
export function leerBusqueda(pagina: string): FilaCR[] | null {
  const i = pagina.indexOf('<table class="CRs2"');
  if (i < 0) return null;
  const fin = pagina.indexOf("</table>", i);
  const tabla = pagina.slice(i, fin < 0 ? undefined : fin);
  const filas = [...tabla.matchAll(/<tr class="(CRn?g1b?|CRn?g2)[^"]*">([\s\S]*?)(?=<tr |$)/g)].map((m) => ({ clase: m[1], html: m[2] }));
  if (!filas.length || !filas[0].clase.endsWith("b")) return null;
  const celdas = (tr: string) => tr.split(/<\/t[dh]>/).slice(0, -1).map(textoCelda);
  const encabezado = celdas(filas[0].html);
  const col: Record<string, number> = {};
  for (const n of COLUMNAS) if (encabezado.includes(n)) col[n] = encabezado.indexOf(n);
  if (Object.keys(col).length < COLUMNAS.length) return null;
  const salida: FilaCR[] = [];
  for (const f of filas.slice(1)) {
    const c = celdas(f.html);
    if (c.length <= Math.max(...Object.values(col)) || !/^\d{1,9}$/.test(c[col.dbkey])) continue;
    const dia = c[col.Del].replace(/\//g, "-");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) continue;
    salida.push({
      id: Number(c[col.dbkey]), titulo: c[col.Torneo].slice(0, 160), inicio: dia,
      organizador: c[col.Organizador].slice(0, 120), lugar: c[col.Lugar].slice(0, 200),
      rondas: Number(c[col["Rd."]]) || 0, jugadores: Number(c[col.n]) || 0,
    });
  }
  return salida;
}

/** El título completo de la página de un torneo (el buscador lo corta a 50). */
export function leerTitulo(pagina: string): string {
  const m = /<h2>([\s\S]*?)<\/h2>/.exec(pagina);
  return m ? textoCelda(m[1]).slice(0, 160) : "";
}

/** El ritmo, si el nombre lo dice («Blitz», «Rápido», «Clásico»…); si no, nada. */
export function ritmoDelTitulo(titulo: string): "" | "bala" | "blitz" | "rapido" | "clasico" {
  const t = titulo.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/\b(bala|bullet)\b/.test(t)) return "bala";
  if (/\bblitz\b|\brelampago\b/.test(t)) return "blitz";
  if (/\b(rapido|rapid|rapidas?)\b/.test(t)) return "rapido";
  if (/\b(clasico|classic|standard|estandar)\b/.test(t)) return "clasico";
  return "";
}

/** El buscador corta el nombre a 50 letras: entonces hay que leer el completo. */
export const cortado = (titulo: string) => titulo.length >= 50 || /\.\.\.$|…$/.test(titulo);

/** La dirección pública de un torneo, siempre la misma (sin el servidor s1, s2…). */
export const urlTorneo = (id: number) => "https://chess-results.com/tnr" + id + ".aspx?lan=2";
