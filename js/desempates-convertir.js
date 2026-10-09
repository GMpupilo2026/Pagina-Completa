/* ===== Desempates explicados — de lo que lee chess-results al torneo que
 * entiende js/pareo/desempates.js =====
 *
 * desempates-chess-results (la Edge Function) devuelve, por jugador, su
 * ficha ronda por ronda tal como la trae chess-results (rival, color,
 * resultado, bye o incomparecencia — ver su cabecera). Esto la convierte en
 * el objeto de torneo `t` que ya entiende js/pareo/desempates.js (el mismo
 * motor de Pareo Integral, con sus 26 desempates del C.07 ya comprobados
 * contra chesspairing y los ejercicios de FIDE): así el cálculo de acá es
 * EXACTAMENTE el mismo código, no una segunda copia.
 *
 * El id de cada jugador es "p" + su número inicial (snr) en chess-results:
 * estable y nunca se repite, aunque el nombre sí (dos "López, Ana" en el
 * mismo torneo). Los nombres quedan en un mapa aparte porque
 * js/pareo/desempates.js no sabe nada de nombres —es a propósito, lo
 * reusa Pareo Integral con sus propios ids—.
 *
 * LA RONDA NO SE ARMA SI ALGO NO CUADRA: sin el rival (su ficha no se pudo
 * leer), sin resultado todavía, o si chess-results trajo una forma que
 * interpretarResultado() de la Edge Function no reconoció (puntos: null).
 * Esa persona le queda esa ronda en 0 con el fallback de
 * js/pareo/torneo.js, y por eso SIEMPRE hay que mirar `advertencias`: ahí se
 * dice si el puntaje reconstruido no coincide con el oficial de chess-results
 * (comparado jugador por jugador), que es la señal de que algo no se leyó
 * bien. Nunca se muestra una clasificación con esa comparación sin hacer.
 */
(function (raiz) {
  "use strict";
  if (raiz.DesempatesConvertir) return;

  const T = typeof module !== "undefined" && module.exports ? require("./pareo/torneo.js") : raiz.PareoTorneo;

  function idDe(snr) { return "p" + snr; }

  // ¿Round-robin? chess-results no lo dice con una bandera; se adivina por
  // la cantidad de rondas (N-1, o N si el torneo es impar) y se deja que
  // quien usa la herramienta lo confirme o lo corrija (ver desempates.html):
  // la única diferencia que hace es el artículo 15.2 (una incomparecencia en
  // un todos contra todos cuenta con el rival programado, no con uno
  // «ficticio»), así que equivocarse acá solo cambia algo si hubo
  // incomparecencias.
  function esPosibleTodos(cantidadJugadores, rondas) {
    if (!cantidadJugadores || !rondas) return false;
    return rondas === cantidadJugadores - 1 || rondas === cantidadJugadores;
  }

  function convertir(datos, opciones) {
    const todos = !!(opciones && opciones.todos);
    const porSnr = new Map(datos.jugadores.map((j) => [j.snr, j]));
    const nombres = {};
    datos.jugadores.forEach((j) => { nombres[idDe(j.snr)] = j.nombre; });

    const rondas = Math.max(0, ...datos.jugadores.map((j) => Math.max(0, ...j.partidas.map((p) => p.ronda))));
    const t = T.nuevo({
      nombre: datos.titulo || "",
      sistema: todos ? "todos" : "suizo",
      rondasTotales: rondas,
      jugadores: datos.jugadores.map((j) => ({ id: idDe(j.snr), nombre: j.nombre, elo: j.elo || 0, titulo: "", fed: "", sexo: "", retiradoDespuesDe: null })),
      numeracion: datos.jugadores.slice().sort((a, b) => a.puesto - b.puesto).map((j) => idDe(j.snr)),
      rondas: [],
    });

    for (let r = 1; r <= rondas; r++) {
      const mesas = [];
      const ausencias = {};
      const resueltos = new Set();
      for (const j of datos.jugadores) {
        if (resueltos.has(j.snr)) continue;
        const p = j.partidas.find((x) => x.ronda === r);
        if (!p || p.puntos == null) continue;
        if (p.bye) {
          ausencias[idDe(j.snr)] = p.puntos >= 1 ? "F" : "H";
          resueltos.add(j.snr);
          continue;
        }
        const rival = porSnr.get(p.rivalSnr);
        if (!rival) continue; // el rival no se pudo leer: esta ronda queda sin armar (se nota en la comparación de puntajes)
        const rp = rival.partidas.find((x) => x.ronda === r);
        resueltos.add(j.snr);
        resueltos.add(rival.snr);
        // El lado de blancas: el que chess-results marcó con color «w»; si
        // ninguno de los dos lo trae, el de número inicial más bajo (no
        // cambia el puntaje de nadie, solo a quién le queda cada color en
        // una fila que de entrada ya venía rara).
        let blancas = j, negras = rival, pb = p, pn = rp;
        if (p.color === "b" || (rp && rp.color === "w")) { blancas = rival; negras = j; pb = rp; pn = p; }
        else if (p.color !== "w" && !(rp && rp.color === "b") && rival.snr < j.snr) { blancas = rival; negras = j; pb = rp; pn = p; }
        let codigo;
        if ((pb && pb.incomparecencia) || (pn && pn.incomparecencia)) {
          codigo = (pb && pb.incomparecencia === "gana") ? "+-" : (pb && pb.incomparecencia === "pierde") ? "-+" : "--";
        } else {
          codigo = pb.puntos === 1 ? "1-0" : pb.puntos === 0 ? "0-1" : "=";
        }
        mesas.push({ b: idDe(blancas.snr), n: idDe(negras.snr), r: codigo });
      }
      t.rondas.push({ mesas, ausencias });
    }

    const advertencias = [];
    for (const j of datos.jugadores) {
      if (j.puntos == null) continue;
      const calculado = T.puntos(t, idDe(j.snr));
      if (Math.abs(calculado - j.puntos) > 1e-9) {
        advertencias.push({ id: idDe(j.snr), nombre: j.nombre, oficial: j.puntos, calculado });
      }
    }

    return { t, nombres, advertencias, posibleTodos: esPosibleTodos(datos.jugadores.length, rondas) };
  }

  const api = { convertir, idDe };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.DesempatesConvertir = api;
})(typeof self !== "undefined" ? self : this);
