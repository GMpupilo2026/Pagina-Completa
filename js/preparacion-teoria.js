/* Preparación de rivales: dónde deja la teoría.
 *
 * Las líneas de su repertorio (resultado.repertorioLineas, del análisis) se
 * comparan jugada por jugada con las partidas de maestros del explorador de
 * Lichess. La primera jugada que los maestros casi no juegan es donde la
 * línea deja la teoría: si la juega ÉL, ahí improvisa o tiene su propia
 * preparación, y es la posición que conviene estudiar; si la juegan sus
 * rivales, él ya salió de libro sin tener que decidir nada.
 *
 * El explorador no se llama desde el navegador: pide un token de Lichess, y
 * un token en la página es un token publicado. Lo llama la Edge Function
 * explorador-maestros, que guarda lo que contesta (ver «Dónde deja la
 * teoría: etapa 5» en docs/decisiones/paneles.md). Acá solo se decide qué
 * posiciones preguntar y qué quiere decir la respuesta.
 *
 *   pendientes(r, datos)   las posiciones que faltan preguntar (FEN de 4
 *                          campos, sin repetir), sabiendo lo que ya contestó
 *   aplicar(r, datos)      → r.teoria: por línea, dónde sale de la teoría
 *   MIN_MAESTROS           cuántas partidas de maestros hacen «teoría»
 *
 * `datos` es { fen: { w, d, b, jugadas: [{ san, w, d, b }], apertura } }, lo
 * que devuelve la función por posición.
 */
(function (raiz, fabrica) {
  "use strict";
  const req = (nombre, global) => (raiz && raiz[global]) || (typeof require === "function" ? require(nombre) : null);
  const api = fabrica(req("./preparacion-posiciones.js", "PreparacionPosiciones"));
  if (typeof module === "object" && module.exports) module.exports = api;
  else raiz.PreparacionTeoria = api;
})(typeof self !== "undefined" ? self : this, function (Pos) {
  "use strict";

  // Una jugada es teoría si los maestros la jugaron al menos 5 veces en esa
  // posición. Con menos, puede ser una partida simultánea o un experimento:
  // no es lo que se estudia.
  const MIN_MAESTROS = 5;
  const MAX_JUGADAS = 20;

  const limpia = (san) => String(san).replace(/[+#!?]+$/, "");
  const suma = (x) => (x ? (x.w || 0) + (x.d || 0) + (x.b || 0) : 0);

  // Cada línea, posición por posición: la de ANTES de cada jugada.
  function recorrido(linea) {
    const out = [];
    let e = Pos.inicial();
    for (let i = 0; i < Math.min(linea.sec.length, MAX_JUGADAS); i++) {
      out.push(Pos.clave(e));
      e = Pos.aplicar(e, linea.sec[i]);
      if (!e) break;
    }
    return out;
  }

  /* Las posiciones que faltan preguntar, sabiendo lo que ya se sabe: en cada
     línea, la primera posición sin respuesta, pero solo si todas las jugadas
     anteriores son teoría. Lo que viene después de que una línea deja la
     teoría no se pregunta nunca: cada pedido al explorador cuenta. Se llama
     por vueltas hasta que no falte nada. */
  function pendientes(r, datos) {
    const vistas = new Set();
    const out = [];
    for (const l of (r && r.repertorioLineas) || []) {
      const fens = recorrido(l);
      for (let i = 0; i < fens.length; i++) {
        const d = datos[fens[i]];
        if (!d) { if (!vistas.has(fens[i])) { vistas.add(fens[i]); out.push(fens[i]); } break; }
        const jugada = (d.jugadas || []).find((j) => limpia(j.san) === limpia(l.sec[i]));
        if (suma(jugada) < MIN_MAESTROS) break;
      }
    }
    return out;
  }

  // Le toca al rival en la media jugada i si lleva blancas y i es par, o
  // negras e i impar.
  const esSuya = (color, i) => (i % 2 === 0) === (color === "w");

  function evaluarLinea(l, datos) {
    const fens = recorrido(l);
    let apertura = null;
    for (let i = 0; i < fens.length; i++) {
      const d = datos[fens[i]];
      if (!d) return { ...l, salida: null, completa: false, apertura };
      if (d.apertura && d.apertura.nombre) apertura = d.apertura;
      const total = suma(d);
      const jugada = (d.jugadas || []).find((j) => limpia(j.san) === limpia(l.sec[i]));
      const maestros = suma(jugada);
      if (maestros >= MIN_MAESTROS) continue;
      const alternativas = (d.jugadas || []).slice().sort((a, b) => suma(b) - suma(a)).slice(0, 3)
        .filter((j) => suma(j) >= MIN_MAESTROS)
        .map((j) => ({ san: j.san, n: suma(j), reparto: total ? suma(j) / total : 0 }));
      return {
        ...l,
        completa: true,
        apertura,
        salida: {
          ply: i,
          quien: esSuya(l.color, i) ? "el" : "rival",
          jugada: l.sec[i],
          veces: l.veces ? l.veces[i] : null,
          maestros,
          total,
          alternativas,
        },
      };
    }
    // Toda la línea es teoría (o llegó al tope sin salir).
    return { ...l, salida: null, completa: fens.length === Math.min(l.sec.length, MAX_JUGADAS), apertura };
  }

  function aplicar(r, datos) {
    const lineas = ((r && r.repertorioLineas) || []).map((l) => evaluarLinea(l, datos || {}));
    r.teoria = {
      fuente: "Lichess, partidas de maestros",
      consultado: new Date().toISOString(),
      lineas,
      faltan: lineas.filter((l) => !l.completa).length,
    };
    return r.teoria;
  }

  return { pendientes, aplicar, evaluarLinea, MIN_MAESTROS, MAX_JUGADAS };
});
