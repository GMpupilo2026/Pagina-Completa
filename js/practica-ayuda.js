/*
 * La ayuda del profe en una partida de práctica (sesion.html).
 *
 * Mientras la clase practica contra el motor, el profesor abre la partida de un
 * alumno en grande, la mira en vivo sin poder mover sus piezas y le manda una
 * ayuda: flechas, círculos y una pista escrita. La ayuda vive en
 * `practice_games.ayuda` y la base decide quién la escribe (ver «El profe mira
 * la partida de un alumno y lo ayuda» en docs/decisiones/clase-en-vivo.md).
 *
 * Acá va lo que no depende de la página, una sola copia para las dos
 * pantallas (la del profe que la arma y la del alumno que la recibe):
 *   - limpiar(): lo que llega de la base es texto de otra persona; solo pasan
 *     casillas de verdad, colores que el tablero conoce y 280 caracteres.
 *   - leerMarcas()/escribirMarcas(): flechas y círculos escritos («g1-f3 e4»),
 *     para quien no dibuja con el ratón (teclado, lector de pantalla).
 *   - enPalabras(): el dibujo dicho con palabras. El color nunca va solo.
 *   - vale(): las flechas son de UNA posición; después de la siguiente jugada
 *     señalarían otra cosa.
 */
(function () {
  "use strict";

  const MAX_MARCAS = 12;
  const MAX_TEXTO = 280;
  const CASILLA = /^[a-h][1-8]$/;

  function colorValido(c) {
    const colores = (window.ClasesBoard && window.ClasesBoard.MARK_COLORS) || {};
    return typeof c === "string" && Object.prototype.hasOwnProperty.call(colores, c) ? c : undefined;
  }

  function limpiarFlechas(lista) {
    if (!Array.isArray(lista)) return [];
    const out = [];
    for (const a of lista) {
      if (!a || !CASILLA.test(a.from) || !CASILLA.test(a.to) || a.from === a.to) continue;
      const f = { from: a.from, to: a.to };
      const c = colorValido(a.color);
      if (c) f.color = c;
      out.push(f);
      if (out.length === MAX_MARCAS) break;
    }
    return out;
  }

  function limpiarCirculos(lista) {
    if (!Array.isArray(lista)) return [];
    const out = [];
    for (const c of lista) {
      const sq = c && (typeof c === "string" ? c : c.square);
      if (!CASILLA.test(sq)) continue;
      const k = { square: sq };
      const col = c && colorValido(c.color);
      if (col) k.color = col;
      out.push(k);
      if (out.length === MAX_MARCAS) break;
    }
    return out;
  }

  // null si no hay ayuda de verdad (ni marcas ni texto).
  function limpiar(ayuda) {
    if (!ayuda || typeof ayuda !== "object") return null;
    const flechas = limpiarFlechas(ayuda.flechas);
    const circulos = limpiarCirculos(ayuda.circulos);
    const texto = typeof ayuda.texto === "string" ? ayuda.texto.trim().slice(0, MAX_TEXTO) : "";
    const jugadas = Number.isInteger(ayuda.jugadas) && ayuda.jugadas >= 0 ? ayuda.jugadas : null;
    if (jugadas === null || (!flechas.length && !circulos.length && !texto)) return null;
    return { jugadas, flechas, circulos, texto };
  }

  // ¿Las flechas se pueden pintar en la posición que tiene ahora el alumno?
  function vale(ayuda, jugadasAhora) {
    return !!ayuda && ayuda.jugadas === jugadasAhora;
  }

  // «g1-f3 e4, d1>h5»  ->  flechas g1→f3 y d1→h5, círculo en e4.
  // Devuelve también lo que no se entendió, para decirlo en vez de tragárselo.
  function leerMarcas(texto) {
    const flechas = [];
    const circulos = [];
    const malas = [];
    String(texto || "").toLowerCase().split(/[\s,;]+/).filter(Boolean).forEach((t) => {
      const m = t.match(/^([a-h][1-8])(?:[-–>x]+([a-h][1-8]))?$/);
      if (!m) { malas.push(t); return; }
      if (m[2] && m[2] !== m[1]) flechas.push({ from: m[1], to: m[2] });
      else circulos.push({ square: m[1] });
    });
    return { flechas: flechas.slice(0, MAX_MARCAS), circulos: circulos.slice(0, MAX_MARCAS), malas };
  }

  function escribirMarcas(flechas, circulos) {
    return (flechas || []).map((a) => a.from + "-" + a.to)
      .concat((circulos || []).map((c) => (typeof c === "string" ? c : c.square)))
      .join(" ");
  }

  function enPalabras(ayuda) {
    if (!ayuda) return "";
    const partes = [];
    const f = ayuda.flechas || [];
    const c = ayuda.circulos || [];
    if (f.length) {
      partes.push((f.length === 1 ? "una flecha " : f.length + " flechas: ")
        + f.map((a) => "de " + a.from + " a " + a.to).join(", "));
    }
    if (c.length) {
      partes.push((c.length === 1 ? "un círculo en " : c.length + " círculos: ")
        + c.map((k) => k.square).join(", "));
    }
    return partes.join("; ");
  }

  window.PracticaAyuda = { limpiar, vale, leerMarcas, escribirMarcas, enPalabras, MAX_TEXTO, MAX_MARCAS };
})();
