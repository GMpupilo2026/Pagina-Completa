/**
 * Ajedrez Integral — repetición espaciada (SRS).
 *
 * La idea, que no es nuestra sino de cómo funciona la memoria: una línea que
 * saliste bien se vuelve a preguntar más tarde cada vez (1 día, 3 días, una
 * semana, dos…), y una que fallaste vuelve hoy mismo. Así el tiempo de estudio
 * se va solo a lo que de verdad se está olvidando, en vez de repasar veinte
 * veces lo que ya se sabe.
 *
 * Es el algoritmo SM-2 recortado a lo que hace falta acá:
 *
 *   facilidad   arranca en 2.5 y se mueve entre 1.3 y 3.0. Es el multiplicador
 *               con que crece el intervalo. Una línea que cuesta baja de
 *               facilidad y por eso vuelve más seguido, para siempre.
 *   intervalo   cuántos días hasta el próximo repaso.
 *   vence       la fecha (YYYY-MM-DD) en que vuelve a tocar.
 *
 * Tres notas, no cinco: al alumno se le pregunta si le salió bien, regular o
 * mal, y "regular" es lo que hizo con ayuda. Cinco grados de SM-2 obligan a
 * pensar cuánto de bien te salió, que es justo lo que no se quiere que ocupe la
 * cabeza mientras se estudia.
 *
 * El estado no sabe de aperturas ni de ajedrez: es un objeto
 * { id → ficha }, así que sirve para cualquier cosa que se repase.
 */
(function () {
  "use strict";

  var FACILIDAD_INICIAL = 2.5;
  var FACILIDAD_MINIMA = 1.3;
  var FACILIDAD_MAXIMA = 3.0;
  // Los dos primeros aciertos van a días fijos: multiplicar desde 0 no
  // funciona, y de 1 a 3 días es donde está la curva del olvido más empinada.
  var PRIMEROS = [1, 3];
  var TOPE_DIAS = 180;   // más allá de medio año no tiene sentido programar nada

  function hoy() {
    var d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
  function sumarDias(fechaISO, dias) {
    var d = new Date(fechaISO + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + dias);
    return d.toISOString().slice(0, 10);
  }
  function entre(n, min, max) { return Math.min(max, Math.max(min, n)); }

  function fichaNueva() {
    return { facilidad: FACILIDAD_INICIAL, intervalo: 0, repasos: 0, fallos: 0, vence: hoy(), ultimo: null };
  }

  /* Devuelve la ficha nueva después de un repaso.
     nota: "bien" | "regular" | "mal". No muta la que le pasan. */
  function calificar(ficha, nota, cuando) {
    var f = Object.assign(fichaNueva(), ficha || {});
    var dia = cuando || hoy();
    f.ultimo = new Date().toISOString();

    if (nota === "mal") {
      // Vuelve hoy mismo y empieza de cero: si no se supo, no se sabe.
      f.fallos += 1;
      f.repasos = 0;
      f.intervalo = 0;
      f.facilidad = entre(f.facilidad - 0.2, FACILIDAD_MINIMA, FACILIDAD_MAXIMA);
      f.vence = dia;
      return f;
    }

    if (nota === "regular") {
      // Salió, pero con ayuda: se avanza poquito y la línea queda marcada como
      // más difícil, así que de acá en adelante vuelve más seguido.
      f.facilidad = entre(f.facilidad - 0.15, FACILIDAD_MINIMA, FACILIDAD_MAXIMA);
      f.repasos += 1;
      f.intervalo = f.intervalo < 1 ? 1 : Math.min(TOPE_DIAS, Math.round(f.intervalo * 1.3));
      f.vence = sumarDias(dia, f.intervalo);
      return f;
    }

    // "bien"
    f.facilidad = entre(f.facilidad + 0.1, FACILIDAD_MINIMA, FACILIDAD_MAXIMA);
    f.intervalo = f.repasos < PRIMEROS.length
      ? PRIMEROS[f.repasos]
      : Math.min(TOPE_DIAS, Math.max(1, Math.round(f.intervalo * f.facilidad)));
    f.repasos += 1;
    f.vence = sumarDias(dia, f.intervalo);
    return f;
  }

  function toca(ficha, dia) {
    if (!ficha || !ficha.vence) return true;         // nunca vista: toca
    return ficha.vence <= (dia || hoy());
  }

  /* De una lista de ids, cuáles toca repasar hoy. Primero lo que se falló, y
     entre lo demás lo más atrasado: si hay 20 pendientes, que las primeras
     sean las que hace más tiempo que vencieron. */
  function pendientes(ids, estado, dia) {
    var d = dia || hoy();
    var e = estado || {};
    return ids.filter(function (id) { return toca(e[id], d); })
      .sort(function (a, b) {
        var fa = e[a], fb = e[b];
        var nuevaA = !fa || !fa.ultimo, nuevaB = !fb || !fb.ultimo;
        // Lo ya empezado antes que lo nuevo: terminar lo que se abrió.
        if (nuevaA !== nuevaB) return nuevaA ? 1 : -1;
        if (nuevaA && nuevaB) return 0;
        return String(fa.vence).localeCompare(String(fb.vence));
      });
  }

  /* Cómo va el estudio en general, para pintarlo arriba de la página. */
  function resumen(ids, estado, dia) {
    var d = dia || hoy();
    var e = estado || {};
    var r = { total: ids.length, nuevas: 0, pendientes: 0, aprendiendo: 0, firmes: 0 };
    ids.forEach(function (id) {
      var f = e[id];
      if (!f || !f.ultimo) { r.nuevas += 1; r.pendientes += 1; return; }
      if (f.vence <= d) r.pendientes += 1;
      // "Firme" es lo que ya aguanta tres semanas sin repasar.
      if (f.intervalo >= 21) r.firmes += 1; else r.aprendiendo += 1;
    });
    return r;
  }

  var api = {
    hoy: hoy, sumarDias: sumarDias, fichaNueva: fichaNueva,
    calificar: calificar, toca: toca, pendientes: pendientes, resumen: resumen,
    FACILIDAD_INICIAL: FACILIDAD_INICIAL, FACILIDAD_MINIMA: FACILIDAD_MINIMA,
    FACILIDAD_MAXIMA: FACILIDAD_MAXIMA, TOPE_DIAS: TOPE_DIAS,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.RepasoEspaciado = api;
})();
