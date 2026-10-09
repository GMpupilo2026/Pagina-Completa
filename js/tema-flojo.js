/* Ajedrez Integral — el tema más flojo de cada alumno.
 *
 * En qué MOTIVO (clavada, tenedor, mate del pasillo…) le cuesta más resolver
 * limpio, sin error ni pista. La cuenta la hace la base,
 * informes_tema_mas_flojo(p_temas), sobre lo que la RLS deja ver: el alumno lo
 * suyo, el profesor sus alumnos, administración todos. Acá solo se le manda la
 * lista de motivos y se le pone nombre a lo que vuelve; las dos cosas salen de
 * entreno/data/temas-motivos.json (lo genera herramientas/temas-motivos.js).
 *
 * Lo usan Informes (una tarjeta más del alumno) y el «Hoy te toca» del hub.
 *
 *   TemaFlojo.cargar(sb, raiz) → Promise<{ [student_id]: { tema, nombre,
 *                                          intentos, limpios, porcentaje } }>
 *       `raiz` es cómo se llega a la raíz del sitio desde la página ("" o "../").
 *   TemaFlojo.FLOJO: por debajo de este porcentaje, el hub lo propone.
 */
(function () {
  "use strict";

  const FLOJO = 70;
  let nombres = null;

  async function motivos(raiz) {
    if (nombres) return nombres;
    const res = await fetch((raiz || "") + "entreno/data/temas-motivos.json");
    if (!res.ok) throw new Error("temas-motivos.json: " + res.status);
    nombres = await res.json();
    return nombres;
  }

  async function cargar(sb, raiz) {
    const n = await motivos(raiz);
    const salida = {};
    // Una fila por alumno; aun así, de mil en mil: PostgREST corta sin avisar.
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await sb.rpc("informes_tema_mas_flojo", { p_temas: Object.keys(n) }).range(desde, desde + 999);
      if (error) throw error;
      (data || []).forEach((f) => {
        salida[f.student_id] = { tema: f.tema, nombre: n[f.tema] || f.tema, intentos: f.intentos, limpios: f.limpios, porcentaje: f.porcentaje };
      });
      if (!data || data.length < 1000) break;
    }
    return salida;
  }

  const api = { cargar, FLOJO };
  if (typeof window !== "undefined") window.TemaFlojo = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
