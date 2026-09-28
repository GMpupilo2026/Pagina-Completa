/**
 * Ajedrez Integral — la cola de «Repasar fallados».
 *
 * Un ejercicio que se resolvió con un error o con una pista no queda sabido:
 * antes se marcaba resuelto igual y no volvía a salir nunca. Acá entra a una
 * cola de repaso espaciado (js/repaso-espaciado.js, el mismo de Aperturas):
 *
 *   con error      → "mal":     vuelve hoy mismo y el intervalo empieza de cero.
 *   solo con pista → "regular": vuelve pronto, y más seguido de ahí en adelante.
 *   limpio         → "bien":    el intervalo crece (1 día, 3, una semana…).
 *
 * Lo que se resolvió limpio a la primera NUNCA entra: la cola es de lo que
 * costó, no de todo lo hecho. Y lo que se repasa limpio tres veces seguidas
 * sale de la cola: ya aguanta solo. «Sale» es una marca (`fuera: true`), no
 * un borrado: la cola se funde entre aparatos sumando fichas (gana la de
 * `ultimo` más nuevo), y una ficha borrada acá volvería desde la cuenta.
 *
 * El estado es { id → ficha de RepasoEspaciado + lo que la página quiera
 * guardar al lado (el tema, por ejemplo) }. Cada página tiene su clave, y la
 * clave va en CLAVES de js/progreso-usuario.js con la fusión "srsPorLinea":
 * así la cola viaja con la cuenta, no con el aparato.
 *
 * No sabe de ajedrez ni de páginas: lo usan Ejercicios por tema y Mates
 * (anotar y repasar) y el hub de Entrenamiento (contar lo que toca hoy).
 */
(function () {
  "use strict";

  var SALE_CON = 3; // repasos limpios seguidos para salir de la cola

  var CLAVES = {
    temas: "entreno_temas_repaso_v1",
    mates: "entreno_mates_repaso_v1",
  };

  function leer(clave) {
    try {
      var o = JSON.parse(localStorage.getItem(clave) || "{}");
      return o && typeof o === "object" && !Array.isArray(o) ? o : {};
    } catch (e) { return {}; }
  }
  function guardar(clave, estado) {
    try { localStorage.setItem(clave, JSON.stringify(estado)); } catch (e) {}
  }

  function notaDe(conError, conPista) {
    return conError ? "mal" : conPista ? "regular" : "bien";
  }

  /* Anota cómo salió un ejercicio. `extra` se guarda junto a la ficha (lo que
     la página necesite para volver a mostrarlo). Devuelve la ficha nueva, o
     null si el ejercicio no está (o ya no está) en la cola. */
  function anotar(clave, id, conError, conPista, extra) {
    var SRS = window.RepasoEspaciado;
    if (!SRS) return null;
    var estado = leer(clave);
    var antes = estado[id];
    var nota = notaDe(conError, conPista);
    var afuera = !antes || antes.fuera;
    if (afuera && nota === "bien") return null;     // limpio y no estaba en la cola: nada que hacer
    // Uno que ya había salido y se vuelve a fallar entra de nuevo, desde cero.
    var f = Object.assign(SRS.calificar(afuera ? null : antes, nota), extra || {});
    // Racha de repasos limpios: "mal" o "regular" la cortan.
    f.limpiosSeguidos = nota === "bien" ? ((antes && antes.limpiosSeguidos) || 0) + 1 : 0;
    f.fuera = f.limpiosSeguidos >= SALE_CON;
    estado[id] = f;
    guardar(clave, estado);
    return f.fuera ? null : f;
  }

  /* Los ids que toca repasar hoy, en el orden de RepasoEspaciado (lo más
     atrasado primero). `existe` descarta los que la página ya no tiene. */
  function pendientes(clave, existe) {
    var SRS = window.RepasoEspaciado;
    if (!SRS) return [];
    var estado = leer(clave);
    var ids = Object.keys(estado).filter(function (id) { return !estado[id].fuera && (!existe || existe(id)); });
    return SRS.pendientes(ids, estado);
  }

  function enLaCola(clave) {
    var estado = leer(clave);
    return Object.keys(estado).filter(function (id) { return !estado[id].fuera; }).length;
  }

  var api = { CLAVES: CLAVES, SALE_CON: SALE_CON, leer: leer, anotar: anotar, pendientes: pendientes, enLaCola: enLaCola, notaDe: notaDe };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.RepasoFallados = api;
})();
