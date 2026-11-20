// Decidir, sin red, a quién de la lista nacional corresponde un nombre escrito
// en Pareo Integral. Vive aparte de index.ts para que
// herramientas/verificar-pareo-institucion.js lo pruebe con Node, sin Deno.
//
// Antes solo valía el nombre EXACTO (el mismo bolsillo de palabras): quien
// escribía «Jose Daniel Rodriguez» —sin el segundo apellido, como se anota a
// un alumno casi siempre— quedaba «no encontrado» aunque la lista nacional
// tuviera a una sola persona con esas palabras, «Rodriguez Jimenez, Jose
// Daniel». El buscador de ajedrezcostarica.com sí lo trae (busca por todas las
// palabras, en cualquier orden); era esta comparación la que lo descartaba.
//
// La regla:
//   - Exactamente un nombre IGUAL (mismas palabras, sin tildes ni orden) →
//     «encontrado», y la página le pone el Elo sola, como siempre.
//   - Más de uno igual → «ambiguo», con los candidatos para elegir.
//   - Ninguno igual, pero nombres que CONTIENEN todas las palabras escritas
//     (al menos dos) → «parecido» si es uno, «ambiguo» si son varios. Nunca se
//     asigna solo: puede ser otra persona que se llama parecido y el alumno no
//     estar en la lista. La página muestra el candidato con su club y su Elo y
//     quien organiza lo confirma con un clic.
//   - Nada de eso → «no_encontrado».

import type { FilaNacional } from "./ajedrezcostarica.ts";

export type Estado = "encontrado" | "no_encontrado" | "ambiguo" | "parecido";
export type Candidato = { fideId: string; nombre: string; club: string; nacional: number | null; fideEstandar: number | null };
export type Emparejado = { estado: Estado; fila: FilaNacional | null; candidatos: Candidato[]; totalCandidatos: number };

export const MAX_CANDIDATOS = 5;

// Las palabras de un nombre, sin tildes, comas ni mayúsculas: "Angulo Cubero,
// Oscar" y "Óscar Angulo Cubero" dan las mismas.
export function palabras(nombre: string): string[] {
  return String(nombre ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase().replace(/[^A-Z ]/g, " ").split(/\s+/).filter(Boolean);
}

export function bolsillo(nombre: string): string {
  return palabras(nombre).sort().join(" ");
}

// ¿Están todas las palabras escritas en el nombre de la lista? Cuenta las
// repetidas («Rodriguez Rodriguez» pide dos), y la palabra entera: «Rod» no
// es «Rodriguez».
function contiene(escritas: string[], deLaLista: string[]): boolean {
  const quedan = [...deLaLista];
  for (const p of escritas) {
    const i = quedan.indexOf(p);
    if (i < 0) return false;
    quedan.splice(i, 1);
  }
  return true;
}

function candidato(f: FilaNacional): Candidato {
  return { fideId: f.fideId, nombre: f.nombre, club: f.club ?? "", nacional: f.nacional, fideEstandar: f.fideEstandar };
}

// `filas`: todas las que trajeron las búsquedas de ese nombre (puede haber
// repetidas: se cuentan por código FIDE, que es lo único que no se repite).
export function emparejar(nombreEscrito: string, filas: FilaNacional[]): Emparejado {
  const escritas = palabras(nombreEscrito);
  const buscado = escritas.slice().sort().join(" ");
  const unicas = new Map<string, FilaNacional>();
  for (const f of filas) if (f.fideId && !unicas.has(f.fideId)) unicas.set(f.fideId, f);
  const todas = [...unicas.values()];

  const iguales = todas.filter((f) => bolsillo(f.nombre) === buscado);
  if (iguales.length === 1) return { estado: "encontrado", fila: iguales[0], candidatos: [candidato(iguales[0])], totalCandidatos: 1 };

  // Con una sola palabra («Rodriguez») cualquier Rodríguez la contiene: eso
  // no es un candidato, es una lista. Hacen falta al menos dos.
  const parecidos = iguales.length > 1 ? iguales
    : escritas.length >= 2 ? todas.filter((f) => contiene(escritas, palabras(f.nombre))) : [];
  if (!parecidos.length) return { estado: "no_encontrado", fila: null, candidatos: [], totalCandidatos: 0 };
  return {
    estado: iguales.length > 1 || parecidos.length > 1 ? "ambiguo" : "parecido",
    fila: null,
    candidatos: parecidos.slice(0, MAX_CANDIDATOS).map(candidato),
    totalCandidatos: parecidos.length,
  };
}
