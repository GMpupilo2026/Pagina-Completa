/* Ajedrez Integral — el Tipo de entrenamiento más flojo de cada alumno.
 *
 * En qué tipo (Detective, la balanza, Elige a tiempo…) le cuesta más resolver
 * limpio, con tres estrellas. La cuenta la hace la base,
 * informes_tipo_mas_flojo(), sobre lo que la RLS deja ver: el alumno lo suyo,
 * el profesor sus alumnos, administración todos. Acá solo se le pone nombre a
 * lo que vuelve, con js/tipos-catalogo.js (el mismo catálogo de la página).
 *
 * Es la hermana de js/tema-flojo.js (el motivo más flojo en Temas). La usa
 * Informes (una tarjeta más del alumno).
 *
 *   TipoFlojo.cargar(sb) → Promise<{ [student_id]: { tipo, nombre,
 *                                    intentos, limpios, porcentaje } }>
 */
(function () {
  "use strict";

  function nombreDe(id) {
    const C = typeof window !== "undefined" ? window.TiposCatalogo : null;
    const t = C && C.tipo(id);
    return t ? t.nombre : id;
  }

  async function cargar(sb) {
    const salida = {};
    // Una fila por alumno; aun así, de mil en mil: PostgREST corta sin avisar.
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await sb.rpc("informes_tipo_mas_flojo").range(desde, desde + 999);
      if (error) throw error;
      (data || []).forEach((f) => {
        salida[f.student_id] = { tipo: f.tipo, nombre: nombreDe(f.tipo), intentos: f.intentos, limpios: f.limpios, porcentaje: f.porcentaje };
      });
      if (!data || data.length < 1000) break;
    }
    return salida;
  }

  const api = { cargar };
  if (typeof window !== "undefined") window.TipoFlojo = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
