// Leer las dos listas de Elo que busca Pareo Integral, sin red: solo el HTML
// que llegó. Vive aparte de index.ts para que
// herramientas/verificar-pareo-listas-elo.js lo pruebe con Node contra
// páginas guardadas, sin Deno ni red. Si mañana FIDE o ajedrezcostarica.com
// cambian su HTML, esto devuelve una lista vacía o un Elo en null (nunca un
// número inventado) y el verificador es el que avisa con qué formato se
// contaba.

// Una persona tal como sale de cualquiera de las dos listas. Lo que una lista
// no dice va en null o vacío: la búsqueda de FIDE no trae el sexo y la lista
// nacional no trae el año de nacimiento (solo la edad).
export type FilaLista = {
  fideId: string;
  nombre: string;
  titulo: string;          // GM, IM, WGM, FM, WIM, CM, WFM, WCM o ""
  fed: string;             // las tres letras de FIDE
  sexo: "m" | "w" | "";
  nacimiento: number | null;  // el año, solo en FIDE
  club: string;            // solo en la nacional
  nacional: number | null;
  estandar: number | null;
  rapido: number | null;
  blitz: number | null;
};

export type ResultadoLista = { filas: FilaLista[]; total: number | null; periodo: string | null };

// Los títulos que entiende Pareo Integral (los de FIDE para el orden inicial).
// «NM» (Maestro Nacional) y los de entrenador no son títulos de FIDE de
// jugador: se dejan fuera.
const TITULOS = ["GM", "IM", "WGM", "FM", "WIM", "CM", "WFM", "WCM"];

// Un rating de 0 (o fuera de lo posible) es «no tiene», no un Elo de 0.
function rating(x: unknown): number | null {
  const n = Number(String(x ?? "").trim());
  return Number.isFinite(n) && n >= 100 && n <= 3500 ? Math.round(n) : null;
}

function desescapar(t: string) {
  return t.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function titulo(t: string) {
  const x = String(t || "").trim().toUpperCase();
  return TITULOS.includes(x) ? x : "";
}

/* ratings.fide.com/incl_search_l.php?search=…&simple=1: lo que pinta el
   buscador de la página de FIDE. Una tabla `#table_results` con una fila por
   persona: FIDE ID, nombre (enlace a su ficha), título, título de
   entrenador, federación (la bandera y las tres letras), Std., Rpd., Blz. y
   año de nacimiento. Arriba dice «N record(s) found»: FIDE devuelve a lo
   sumo unas 450 filas aunque encuentre más. Se busca por nombre o por código
   (con el código, una sola fila). */
export function leerBusquedaFide(html: string): ResultadoLista {
  const total = html.match(/(\d+)\s+record\(s\)\s+found/i);
  const cuerpo = html.match(/<tbody>([\s\S]*?)<\/tbody>/i);
  const filas: FilaLista[] = [];
  if (cuerpo) {
    for (const tr of cuerpo[1].split(/<tr[\s>]/i).slice(1)) {
      const celdas = [...tr.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/gi)].map((m) => ({ attrs: m[1], texto: desescapar(m[2]) }));
      if (celdas.length < 9) continue;
      const fideId = celdas[0].texto;
      const nombre = celdas[1].texto;
      if (!/^\d{3,11}$/.test(fideId) || !nombre) continue;
      const fed = celdas[4].texto.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
      const anio = Number(celdas[8].texto);
      filas.push({
        fideId, nombre, titulo: titulo(celdas[2].texto), fed, sexo: "",
        nacimiento: Number.isInteger(anio) && anio >= 1900 && anio <= 2100 ? anio : null,
        club: "", nacional: null,
        estandar: rating(celdas[5].texto), rapido: rating(celdas[6].texto), blitz: rating(celdas[7].texto),
      });
    }
  }
  return { filas, total: total ? Number(total[1]) : (cuerpo ? filas.length : null), periodo: null };
}

/* ajedrezcostarica.com/es/national-rating?name=…: una página de Next.js que
   trae los jugadores como JSON dentro de sus <script> (con las comillas
   escapadas). Cada uno: {"player":{"fideId":"6501435","name":"Angulo Cubero,
   Oscar","club":"Escazú","title":"NM","rank":"14","gender":1,…,"age":37,…,
   "ratings":{"national":2268,"fideStandard":2152,"fideRapid":2095,
   "fideBlitz":2154,…}}. «gender» es 1 hombre y 2 mujer (comprobado en
   octubre de 2026 con los nombres de la lista). Trae a lo sumo 50 por
   página; arriba dice cuántos encontró («2 jugadores») y de qué mes es la
   lista («Octubre 2026»). */
export function leerListaNacionalCompleta(html: string): ResultadoLista {
  const t = html.replace(/\\/g, "");
  const filas: FilaLista[] = [];
  const vistos = new Set<string>();
  const re = /"player":\{"fideId":"(\d*)","name":"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const resto = t.slice(m.index, m.index + 2500);
    const r = resto.match(/"ratings":\{"national":(-?\d+|null),"fideStandard":(-?\d+|null),"fideRapid":(-?\d+|null),"fideBlitz":(-?\d+|null)/);
    if (!m[1] || !r || vistos.has(m[1])) continue;
    vistos.add(m[1]);
    const club = resto.match(/"club":"([^"]*)"/);
    const tit = resto.match(/"title":"([^"]*)"/);
    const gen = resto.match(/"gender":(\d+)/);
    filas.push({
      fideId: m[1], nombre: m[2].trim(), titulo: titulo(tit ? tit[1] : ""), fed: "CRC",
      sexo: gen && gen[1] === "1" ? "m" : gen && gen[1] === "2" ? "w" : "",
      nacimiento: null, club: club ? club[1].trim() : "",
      nacional: rating(r[1]), estandar: rating(r[2]), rapido: rating(r[3]), blitz: rating(r[4]),
    });
  }
  const total = t.match(/"children":"(\d+) jugadores"|<p>(\d+) jugadores<\/p>/);
  const periodo = t.match(/(Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Setiembre|Octubre|Noviembre|Diciembre) (20\d\d)/);
  return {
    filas,
    total: total ? Number(total[1] || total[2]) : null,
    periodo: periodo ? periodo[1] + " " + periodo[2] : null,
  };
}
