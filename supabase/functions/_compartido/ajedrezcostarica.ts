// Leer el Elo de las dos páginas públicas, sin red: solo el HTML que llegó.
//
// Compartido por dos Edge Functions —`elo-fide` (el Elo de una persona, con
// su código FIDE) y `pareo-elo-nacional` (el de una lista de nombres, para
// Pareo Integral)— así que vive en `_compartido/` y cada una se lo trae con
// `node herramientas/funciones-armar.js` al desplegar (ver su cabecera). Vive
// aparte de cada index.ts, además, para que `herramientas/verificar-elo-fide.js`
// lo pruebe con Node contra páginas guardadas, sin Deno ni red. Si mañana la
// FIDE o ajedrezcostarica.com cambian su HTML, esto devuelve null (nunca un
// número inventado) y el verificador es el que avisa con qué formato se
// contaba.

export type FichaFide = { nombre: string | null; estandar: number | null };
export type FilaNacional = { fideId: string; nombre: string; nacional: number | null; fideEstandar: number | null };

// Un rating de 0 (o fuera de lo posible) es «no tiene», no un Elo de 0.
function rating(x: unknown): number | null {
  const n = Number(x);
  return Number.isFinite(n) && n >= 100 && n <= 3500 ? Math.round(n) : null;
}

function desescapar(t: string) {
  return t.replace(/&amp;/g, "&").replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}

/* ratings.fide.com/profile/<id>: la ficha pública. El Estándar va en
   `<div class="profile-standart profile-game">…<p>2152</p>`; quien no tiene
   rating dice «Not rated» en ese <p>. El nombre sale del <title>
   («Angulo Cubero, Oscar FIDE Profile»). Ojo: un código que no existe
   también contesta 200, con el título genérico «Chess Players Arbiters
   Trainers Database FIDE Profile» y sin el bloque de ratings — por eso manda
   el bloque, no el título. */
export function leerFichaFide(html: string): FichaFide | null {
  const bloque = html.match(/class="profile-standart[^"]*"[\s\S]*?<p>\s*([^<]*?)\s*<\/p>/i);
  if (!bloque) return null;
  const titulo = html.match(/<title>\s*([\s\S]*?)\s+FIDE Profile\s*<\/title>/i);
  return {
    nombre: titulo ? desescapar(titulo[1]) || null : null,
    estandar: /^\d+$/.test(bloque[1]) ? rating(bloque[1]) : null,
  };
}

/* ajedrezcostarica.com/es/national-rating?name=…: una página de Next.js que
   trae los jugadores como JSON dentro de sus <script> (con las comillas
   escapadas). Cada uno: {"player":{"fideId":"6501435","name":"Angulo Cubero,
   Oscar",…,"ratings":{"national":2268,"fideStandard":2152,…}}. Se quitan las
   barras de escape y se leen por código FIDE, que es lo único que no se
   repite: por nombre hay homónimos. */
export function leerListaNacional(html: string): FilaNacional[] {
  const t = html.replace(/\\/g, "");
  const filas: FilaNacional[] = [];
  const re = /"player":\{"fideId":"(\d*)","name":"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const resto = t.slice(m.index, m.index + 2000);
    const r = resto.match(/"ratings":\{"national":(-?\d+|null),"fideStandard":(-?\d+|null)/);
    if (!m[1] || !r) continue;
    filas.push({ fideId: m[1], nombre: m[2], nacional: rating(r[1]), fideEstandar: rating(r[2]) });
  }
  return filas;
}

// Por qué nombre se busca en la lista nacional: los apellidos («Angulo Cubero»
// de «Angulo Cubero, Oscar»), después el nombre completo y por último el
// primer apellido. De lo más preciso a lo más amplio.
export function busquedasPorNombre(nombre: string | null | undefined): string[] {
  const n = String(nombre ?? "").replace(/\s+/g, " ").trim();
  if (!n) return [];
  const apellidos = n.includes(",") ? n.split(",")[0].trim() : n;
  const primero = apellidos.split(" ")[0];
  return [...new Set([apellidos, n.replace(",", ""), primero].filter((x) => x.length >= 3))];
}

// El mes de Costa Rica (UTC-6 todo el año) al que pertenece una lectura: el
// primer día del mes, como lo guarda elo_historial.periodo.
export function periodoCostaRica(ahora: Date): string {
  const cr = new Date(ahora.getTime() - 6 * 3600 * 1000);
  return `${cr.getUTCFullYear()}-${String(cr.getUTCMonth() + 1).padStart(2, "0")}-01`;
}
