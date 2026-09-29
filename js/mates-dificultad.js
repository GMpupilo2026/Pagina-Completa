/* La dificultad de los Mates, medida con los intentos reales.
 *
 * La calcula herramientas/mates-calibrar.js y la deja en
 * entreno/data/mates-dificultad.json: el centro de cada categoría y la
 * dificultad (en puntos Elo) de cada mate con suficientes intentos. Este
 * archivo decide qué hace la página con eso; lo usan entreno/mates.html y su
 * verificador.
 *
 * Una categoría se ordena de fácil a difícil SOLO cuando tiene calibrados al
 * menos el 80 % de sus mates. Con menos, casi todos irían a su centro y el
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

  const MatesDificultad = { COBERTURA, ordenada, de, ordenar };
  if (typeof module !== "undefined" && module.exports) module.exports = MatesDificultad;
  else raiz.MatesDificultad = MatesDificultad;
})(typeof window !== "undefined" ? window : globalThis);
