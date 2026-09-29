/* La dificultad de los Mates, medida con los intentos reales.
 *
 * La calcula herramientas/mates-calibrar.js y la deja en
 * entreno/data/mates-dificultad.json: el centro de cada categoría y la
 * dificultad (en puntos Elo) de cada mate con suficientes intentos. Este
 * archivo decide qué hace la página con eso; lo usan entreno/mates.html y su
 * verificador.
 *
 * Una categoría se ordena de fácil a difícil SOLO cuando tiene calibrados al
 * menos el 80 % de sus mates. Mientras tanto, se BARAJA por bloques de 50 con
 * una semilla por alumno (barajar()): sin eso, todos los alumnos hacían los
 * mismos primeros mates del libro y la calibración juntaba muchos intentos
 * de unos pocos mates y ninguno del resto (hacen falta 8 por mate). Por
 * bloques, el orden grueso del libro se mantiene; con la semilla del alumno,
 * cada uno ve siempre el mismo orden, en cualquier aparato. Con menos, casi todos irían a su centro y el
 * orden lo pondría el puñado medido: mejor el orden del libro, que al menos
 * es el de un autor. Los que faltan en una categoría ordenada van con el
 * centro de su categoría, sin pasar adelante de nada.
 */
(function (raiz) {
  const COBERTURA = 0.8;

  function ordenada(datos, cat) {
    const c = datos && datos.categorias && datos.categorias[cat];
    return !!(c && c.total > 0 && c.calibrados / c.total >= COBERTURA);
  }

  function de(datos, id) {
    const e = datos && datos.elo && datos.elo[id];
    return typeof e === "number" ? e : null;
  }

  /* Una copia de la lista, de fácil a difícil si la categoría está calibrada;
     si no, igual que llegó. Los empates conservan el orden del libro. */
  function ordenar(lista, datos, cat) {
    if (!ordenada(datos, cat)) return lista.slice();
    const centro = datos.categorias[cat].centro;
    return lista
      .map((p, i) => ({ p, i, e: de(datos, p.id) === null ? centro : de(datos, p.id) }))
      .sort((a, b) => a.e - b.e || a.i - b.i)
      .map((x) => x.p);
  }

  /* Un número de 32 bits a partir de un texto (el id del alumno). */
  function semillaDe(texto) {
    let h = 2166136261;
    for (const ch of String(texto || "")) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  /* Una copia de la lista, barajada DENTRO de cada bloque de `tam`: el bloque
     sigue en su lugar. Misma semilla, mismo orden. Sin semilla, igual que llegó. */
  const BLOQUE = 50;
  function barajar(lista, semilla, tam) {
    const copia = lista.slice();
    if (semilla === null || semilla === undefined || semilla === "") return copia;
    let s = semillaDe(semilla) || 1;
    const azar = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    const t = tam || BLOQUE;
    for (let ini = 0; ini < copia.length; ini += t) {
      const fin = Math.min(copia.length, ini + t);
      for (let i = fin - 1; i > ini; i--) {
        const j = ini + Math.floor(azar() * (i - ini + 1));
        const x = copia[i]; copia[i] = copia[j]; copia[j] = x;
      }
    }
    return copia;
  }
  /* El orden de una categoría: por dificultad si está calibrada; si no,
     barajada por bloques con la semilla del alumno. */
  function orden(lista, datos, cat, semilla) {
    return ordenada(datos, cat) ? ordenar(lista, datos, cat) : barajar(lista, semilla);
  }

  const MatesDificultad = { COBERTURA, BLOQUE, ordenada, de, ordenar, barajar, orden };
  if (typeof module !== "undefined" && module.exports) module.exports = MatesDificultad;
  else raiz.MatesDificultad = MatesDificultad;
})(typeof window !== "undefined" ? window : globalThis);
