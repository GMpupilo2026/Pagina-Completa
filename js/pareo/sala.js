/* ===== Pareo Integral — la sala: dónde está cada mesa =====
 *
 * Lo pidió el dueño para la Eliminatoria JDN de PZ: que el QR del gafete
 * diga, además de la mesa, DÓNDE está en el salón. Quien organiza dice en
 * Pareo (Publicar → «La sala») cómo están acomodadas las mesas, y la vista
 * corta del QR (torneos-pareo.html, vistaGafete) dibuja el plano con la mesa
 * del jugador marcada y, si la subió, la foto del salón debajo.
 *
 *   t.sala = { filas, porFila,          // cuántas filas y cuántas mesas en cada una
 *              derecha,                 // la mesa más baja de cada fila, a la derecha (mirando hacia el fondo)
 *              zigzag,                  // cada fila sigue donde terminó la anterior
 *              frente, fondo,           // qué hay adelante (la fila 1) y al fondo
 *              foto }                   // la foto o el croquis del salón (data:image/…)
 *
 * Las mesas se numeran de la 1 en adelante en todo el salón (la mesa de la
 * sala, V.mesaFisica: con t.mesaInicial, otro torneo del mismo salón empieza
 * donde termina el primero). El dibujo y «fila 2 · la 3.ª mesa desde la
 * derecha» son los del plano del Centroamericano (js/centroamericano-plano.js),
 * una sola copia: acá solo se arma ese plano a partir de la configuración.
 * Ver «El plano de la sala en el QR del gafete» en docs/decisiones/juegos-y-torneos.md.
 */
(function () {
  "use strict";

  const SALA = "Sala";      // el «torneo» de todas las mesas del plano: el salón entero
  const FOTO = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;
  const entero = (v, min, max) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : 0; };

  // La configuración, con lo que no tenga sentido afuera (como la limpia la
  // función pareo-publicar). Sin filas o sin mesas, null: no hay sala.
  function limpiar(s) {
    if (!s || typeof s !== "object") return null;
    const filas = entero(s.filas, 0, 30), porFila = entero(s.porFila, 0, 30);
    if (!filas || !porFila) return null;
    const texto = (x, max) => (typeof x === "string" ? x.trim().slice(0, max) : "");
    return {
      filas, porFila, derecha: s.derecha !== false, zigzag: s.zigzag === true,
      frente: texto(s.frente, 60) || "la entrada", fondo: texto(s.fondo, 60) || "el fondo de la sala",
      foto: typeof s.foto === "string" && FOTO.test(s.foto) && s.foto.length <= 450000 ? s.foto : "",
    };
  }

  // El plano en la forma de js/centroamericano-plano.js: cada fila con sus
  // mesas de derecha a izquierda (mirando hacia el fondo), una mesa por número.
  function plano(s) {
    const c = limpiar(s);
    if (!c) return null;
    const filas = [];
    for (let r = 0; r < c.filas; r++) {
      const mesas = [];
      for (let k = 0; k < c.porFila; k++) {
        // k: la posición desde la derecha; i: cuántas mesas más baja que ella
        // hay en la fila. Con la más baja a la izquierda, al revés; en zigzag,
        // las filas pares (2.ª, 4.ª…) van en sentido contrario.
        let i = c.derecha ? k : c.porFila - 1 - k;
        if (c.zigzag && r % 2 === 1) i = c.porFila - 1 - i;
        mesas.push({ t: [r * c.porFila + i + 1] });
      }
      filas.push({ grupos: [{ torneo: SALA, mesas }] });
    }
    return { v: 1, frente: c.frente, fondo: c.fondo, filas };
  }

  // Dónde está la mesa `n` del salón: { fila, desdeDerecha, mesasEnFila }, o null.
  function ubicar(s, n) {
    const p = plano(s);
    return p && window.CentroamericanoPlano ? window.CentroamericanoPlano.ubicar(p, SALA, Number(n)) : null;
  }

  // El plano dibujado (SVG) con la mesa `n` marcada.
  function dibujar(s, n) {
    const p = plano(s);
    return p && window.CentroamericanoPlano ? window.CentroamericanoPlano.dibujar(p, { marca: { torneo: SALA, tablero: Number(n) }, chico: true }) : null;
  }

  window.PareoSala = { limpiar, plano, ubicar, dibujar };
})();

/*! rev bfb5bbb0d2d82f9f */
