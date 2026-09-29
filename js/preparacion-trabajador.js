/* Preparación de rivales: las cuentas, en segundo plano (Web Worker).
 *
 * Leer y analizar 30.000 partidas tarda unos segundos; en la página, esos
 * segundos la dejaban congelada (sin poder parar nada ni escribir). Acá corren
 * aparte. Además el trabajador se queda con las partidas leídas: cambiar los
 * filtros vuelve a analizar al instante, sin volver a leer ni a bajar nada.
 *
 * Mensajes (cada uno con su `id`, que vuelve en la respuesta):
 *   { tipo: "leer", texto }                     → { total, jugadores }
 *   { tipo: "analizar", rival, filtros }        → { resultado }
 *   { tipo: "leerAlumno", texto }               → { total, jugadores }
 *   { tipo: "cruzar", rival, filtros, alumno, planes } → { cruce }
 * Las partidas del alumno se guardan aparte: leerlas no borra las del rival.
 * Si algo falla: { error }.
 */
/* global importScripts, PreparacionAnalisis */
importScripts("vendor/chess.js", "preparacion-lineas.js", "preparacion-posiciones.js", "preparacion-libro.js", "preparacion-tactica.js", "preparacion-estructuras.js", "preparacion-analisis.js", "preparacion-cruce.js");
/* global PreparacionCruce */

let partidas = [];
let delAlumno = [];

self.onmessage = (ev) => {
  const m = ev.data || {};
  try {
    if (m.tipo === "leer") {
      partidas = PreparacionAnalisis.leerPgn(m.texto);
      self.postMessage({ id: m.id, total: partidas.length, jugadores: PreparacionAnalisis.jugadores(partidas).slice(0, 200) });
    } else if (m.tipo === "analizar") {
      self.postMessage({ id: m.id, resultado: PreparacionAnalisis.analizar(partidas, m.rival, m.filtros || {}) });
    } else if (m.tipo === "leerAlumno") {
      delAlumno = PreparacionAnalisis.leerPgn(m.texto);
      self.postMessage({ id: m.id, total: delAlumno.length, jugadores: PreparacionAnalisis.jugadores(delAlumno).slice(0, 200) });
    } else if (m.tipo === "cruzar") {
      self.postMessage({ id: m.id, cruce: PreparacionCruce.cruzar(partidas, m.rival, m.filtros || {}, delAlumno, m.alumno, m.planes) });
    } else {
      self.postMessage({ id: m.id, error: "Mensaje desconocido" });
    }
  } catch (e) {
    self.postMessage({ id: m.id, error: String((e && e.message) || e) });
  }
};
