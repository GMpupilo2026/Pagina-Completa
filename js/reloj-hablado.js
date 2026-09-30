/* El reloj de un ejercicio con tiempo, dicho en voz para quien no ve la barra.

   ¡Te reto! y Racha táctica tienen una barra que se achica: quien la ve sabe
   cuánto le queda de un vistazo, pero quien usa lector de pantalla no tenía
   forma de saberlo y perdía por tiempo sin aviso. Con esto:
     - «tiempo», «reloj», «cuánto tiempo», «segundos» en el recuadro dicen los
       segundos que quedan (`esPregunta` + `decirQueda`);
     - en Modo Adaptado se avisa solo a la mitad del tiempo y a los 10 segundos.
   Una sola copia para las dos páginas (eran dos copias del mismo código). */
(function () {
  "use strict";

  function normalizar(t) {
    return String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[¿?¡!.,]/g, "").replace(/\s+/g, " ").trim();
  }

  // Las formas de preguntarlo que se oyeron en la recorrida, y sus variantes.
  var PREGUNTA = /^(tiempo|el tiempo|reloj|el reloj|segundos|cuantos segundos( me quedan| quedan| tengo)?|cuanto tiempo( me queda| queda| tengo| falta| me falta)?|cuanto queda|cuanto me queda)$/;

  function crear(cfg) {
    var inicio = 0, limite = 0, avisos = [];

    function pararAvisos() {
      avisos.forEach(function (id) { clearTimeout(id); });
      avisos = [];
    }
    function queda() {
      if (!limite) return 0;
      return Math.max(0, Math.ceil((inicio + limite - Date.now()) / 1000));
    }
    function frase(s) {
      return s === 1 ? "Te queda 1 segundo." : "Te quedan " + s + " segundos.";
    }

    return {
      esPregunta: function (texto) { return PREGUNTA.test(normalizar(texto)); },
      // Lo que se dice al preguntar; sin ejercicio en marcha, se dice eso.
      texto: function () {
        return limite ? frase(queda()) : "Ahora mismo no corre el reloj.";
      },
      empezar: function (ms) {
        pararAvisos();
        inicio = Date.now();
        limite = ms;
        if (!cfg.hablar || !cfg.hablar()) return;
        /* Los avisos van por la región viva del recuadro (cfg.decir), la misma
           que contesta lo escrito: una región aparte se pisaría con ella. A los
           10 s solo si el ejercicio dura bastante más (con 10 s en total sería
           decirlo al empezar). */
        var mitad = Math.round(ms / 2);
        avisos.push(setTimeout(function () { cfg.decir("Mitad del tiempo. " + frase(queda())); }, mitad));
        if (ms - 10000 > mitad + 2000) {
          avisos.push(setTimeout(function () { cfg.decir("Quedan 10 segundos."); }, ms - 10000));
        }
      },
      parar: function () { pararAvisos(); limite = 0; },
      queda: queda,
    };
  }

  window.RelojHablado = { crear: crear };
})();
