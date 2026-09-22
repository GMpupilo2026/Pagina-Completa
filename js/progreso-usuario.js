/* ===== Ajedrez Integral — El progreso vive en la cuenta, no en el aparato =====
 *
 * Cada página de ejercicios guarda su progreso en localStorage (lecciones
 * resueltas, mejores puntuaciones, por dónde iba una prueba…). Eso se queda en
 * el aparato: quien entrena en la computadora y luego abre el celular empezaba
 * de cero. Este módulo espeja esas mismas claves en la tabla `training_state`
 * de Supabase, bajo el id del alumno, y las vuelve a bajar al abrir sesión en
 * otro lado.
 *
 * Cómo se usa en una página (dos líneas):
 *     <script src="../js/progreso-usuario.js"></script>
 *     await ProgresoUsuario.init();   // antes de leer el progreso y pintar
 *
 * Después no hay que tocar nada más: las páginas siguen usando localStorage
 * como siempre y este módulo intercepta las escrituras para subirlas.
 *
 * Al juntar dos aparatos NO gana "el último que escribió" —eso borraría
 * trabajo—: cada clave dice cómo se funde. Los conjuntos de ejercicios
 * resueltos se unen, las mejores marcas se quedan con la mayor, y lo que es
 * "por dónde iba" se queda con lo más avanzado. Así, entrenar en dos aparatos
 * a la vez suma en vez de pisar.
 *
 * Si no hay sesión iniciada o la red falla, no pasa nada: la página sigue
 * funcionando con su localStorage de siempre y se sube la próxima vez.
 */
window.ProgresoUsuario = (function () {
  "use strict";

  const TABLA = "training_state";

  /* ---------------- Cómo se funde cada cosa ---------------- */
  const leerObjeto = (crudo) => {
    try { const v = JSON.parse(crudo); return v && typeof v === "object" ? v : {}; } catch (e) { return {}; }
  };

  const FUSIONES = {
    // Conjuntos de ejercicios/lecciones resueltos: se unen (lo hecho, hecho está).
    unionObjeto(local, remoto) {
      if (local === null) return remoto;
      if (remoto === null) return local;
      return JSON.stringify(Object.assign({}, leerObjeto(remoto), leerObjeto(local)));
    },
    // Objetos "id → puntuación" (estrellas, ejercicios por nivel): la mejor de cada una.
    maxPorClave(local, remoto) {
      if (local === null) return remoto;
      if (remoto === null) return local;
      const a = leerObjeto(remoto), b = leerObjeto(local), salida = Object.assign({}, a);
      Object.keys(b).forEach((k) => {
        const x = Number(a[k]), y = Number(b[k]);
        salida[k] = (Number.isFinite(x) && Number.isFinite(y)) ? Math.max(x, y) : (b[k] !== undefined ? b[k] : a[k]);
      });
      return JSON.stringify(salida);
    },
    // Objetos "id → marca donde MENOS es mejor" (jugadas para terminar): la
    // menor de cada una. Es el espejo de maxPorClave, y hace falta aparte:
    // fundirlos con el máximo se quedaría con la PEOR marca de los dos aparatos.
    minPorClave(local, remoto) {
      if (local === null) return remoto;
      if (remoto === null) return local;
      const a = leerObjeto(remoto), b = leerObjeto(local), salida = Object.assign({}, a);
      Object.keys(b).forEach((k) => {
        const x = Number(a[k]), y = Number(b[k]);
        salida[k] = (Number.isFinite(x) && x > 0 && Number.isFinite(y) && y > 0) ? Math.min(x, y) : (b[k] !== undefined ? b[k] : a[k]);
      });
      return JSON.stringify(salida);
    },
    // Mejores marcas y contadores: el número más alto.
    maxNumero(local, remoto) {
      if (local === null) return remoto;
      if (remoto === null) return local;
      const a = Number(local), b = Number(remoto);
      if (!Number.isFinite(a)) return remoto;
      if (!Number.isFinite(b)) return local;
      return String(Math.max(a, b));
    },
    // Marcadores de "dónde iba": vale el del aparato que está en uso.
    ultimoLugar(local, remoto) {
      return local !== null ? local : remoto;
    },
    // Prueba a medias: gana la que llegó más lejos, para no repetir preguntas.
    pruebaEnCurso(local, remoto) {
      if (local === null) return remoto;
      if (remoto === null) return local;
      const idx = (crudo) => {
        const v = leerObjeto(crudo);
        return (v.estado && Number(v.estado.idx)) || 0;
      };
      return idx(local) >= idx(remoto) ? local : remoto;
    },
    // Repetición espaciada: un objeto id → { ultimo, vence, … }. No gana un
    // aparato entero, sino la ficha de CADA línea que se repasó más tarde: si
    // repasé unas en la compu y otras en el celular, se quedan las dos.
    srsPorLinea(local, remoto) {
      if (local === null) return remoto;
      if (remoto === null) return local;
      const a = leerObjeto(remoto), b = leerObjeto(local), salida = Object.assign({}, a);
      Object.keys(b).forEach((k) => {
        const cuando = (f) => Date.parse((f && f.ultimo) || 0) || 0;
        if (!salida[k] || cuando(b[k]) >= cuando(salida[k])) salida[k] = b[k];
      });
      return JSON.stringify(salida);
    },
    // Resultado de una prueba: el más reciente por fecha.
    masReciente(local, remoto) {
      if (local === null) return remoto;
      if (remoto === null) return local;
      const cuando = (crudo) => Date.parse(leerObjeto(crudo).fecha || 0) || 0;
      return cuando(local) >= cuando(remoto) ? local : remoto;
    },
  };

  /* ---------------- Qué se sincroniza ----------------
     Solo progreso. Las preferencias del aparato (tema claro/oscuro, modo
     adaptado) se quedan en el aparato a propósito: son de dónde se está
     mirando, no de quién mira. */
  const CLAVES = [
    { clave: "entreno_solved",                   fusion: "unionObjeto" },   // 4×4
    { clave: "entreno_aprende_solved",           fusion: "unionObjeto" },   // Aprende
    { clave: "entreno_mates_solved",             fusion: "unionObjeto" },
    { clave: "entreno_tactica_solved",           fusion: "unionObjeto" },
    { clave: "entreno_temas_solved",             fusion: "unionObjeto" },
    { clave: "f100:progreso",                    fusion: "unionObjeto" },   // Los 100 finales
    { clave: "entreno_practicas_v1",             fusion: "maxPorClave" },   // serie → estrellas
    { clave: "entreno_desafios_v2",              fusion: "maxPorClave" },
    { clave: "concentracion_objeto_perdido_v1",  fusion: "maxPorClave" },   // nivel → ejercicios
    { clave: "entreno_mates_best",               fusion: "maxNumero" },
    { clave: "entreno_mates_streak",             fusion: "maxNumero" },
    { clave: "entreno_tactica_best",             fusion: "maxNumero" },
    { clave: "entreno_tactica_streak",           fusion: "maxNumero" },
    { clave: "entreno_temas_best",               fusion: "maxNumero" },
    { clave: "entreno_temas_streak",             fusion: "maxNumero" },
    { clave: "entreno_temas_done",               fusion: "maxNumero" },
    { clave: "entreno_temas_total",              fusion: "maxNumero" },
    { clave: "entreno_practicas_best",           fusion: "maxNumero" },
    { clave: "entreno_practicas_streak",         fusion: "maxNumero" },
    { prefijo: "entreno_coord_best_",            fusion: "maxNumero" },     // una por modo
    { clave: "entreno_temas_last",               fusion: "ultimoLugar" },
    { clave: "diagnostico_estado_v1",            fusion: "pruebaEnCurso" },
    { clave: "diagnostico_resultado_v1",         fusion: "masReciente" },
    { clave: "ilumina_solved",                   fusion: "unionObjeto" },   // Ilumina el Tablero
    { clave: "ilumina_hints_earned",             fusion: "maxNumero" },
    { clave: "ilumina_hints_used",               fusion: "maxNumero" },
    { clave: "confites_best",                    fusion: "maxNumero" },   // Confites del caballo
    { clave: "confites_best_limpio",             fusion: "maxNumero" },
    { clave: "sonar_estrellas_v1",               fusion: "maxPorClave" },   // El Sonar: nivel → estrellas
    { clave: "sonar_mejor_v1",                   fusion: "minPorClave" },   // nivel → menos jugadas
    { clave: "aperturas_srs_v1",                 fusion: "srsPorLinea" },  // Aperturas y celadas
    { clave: "aperturas_vistas_v1",              fusion: "maxNumero" },
    { clave: "entreno_visualizacion_solved",     fusion: "unionObjeto" },   // Visualización
    { clave: "entreno_visualizacion_best",       fusion: "maxNumero" },
    { clave: "entreno_visualizacion_streak",     fusion: "maxNumero" },
    { clave: "entreno_visualizacion_last",       fusion: "ultimoLugar" },
  ];

  function fusionDe(clave) {
    const entrada = CLAVES.find((c) => (c.clave && c.clave === clave) || (c.prefijo && clave.indexOf(c.prefijo) === 0));
    return entrada ? FUSIONES[entrada.fusion] : null;
  }

  /* ---------------- Estado del módulo ---------------- */
  let usuarioId = null;
  let listo = false;
  const pendientes = new Set();   // claves por subir
  let temporizador = null;
  const guardarOriginal = window.localStorage.setItem.bind(window.localStorage);
  const borrarOriginal = window.localStorage.removeItem.bind(window.localStorage);

  function leerLocal(clave) {
    try { return window.localStorage.getItem(clave); } catch (e) { return null; }
  }
  function escribirLocal(clave, valor) {
    try { if (valor === null) borrarOriginal(clave); else guardarOriginal(clave, valor); } catch (e) {}
  }

  // Se interceptan las escrituras de las páginas para enterarse de los cambios.
  // Se hace al cargar el archivo, no en init(), para no perder lo que una página
  // guarde mientras todavía se está bajando el progreso de la nube.
  function intervenirAlmacenamiento() {
    window.localStorage.setItem = function (clave, valor) {
      guardarOriginal(clave, valor);
      if (fusionDe(String(clave))) encolar(String(clave));
    };
    window.localStorage.removeItem = function (clave) {
      borrarOriginal(clave);
      if (fusionDe(String(clave))) encolar(String(clave));
    };
  }

  function encolar(clave) {
    pendientes.add(clave);
    if (!listo || !usuarioId) return;              // se subirá al terminar init()
    clearTimeout(temporizador);
    temporizador = setTimeout(sincronizar, 1200);  // se juntan los cambios seguidos
  }

  async function sincronizar() {
    if (!usuarioId || !pendientes.size || !window.sb) return;
    const claves = [...pendientes];
    pendientes.clear();
    const ahora = new Date().toISOString();
    const filas = [], borrar = [];
    claves.forEach((clave) => {
      const valor = leerLocal(clave);
      if (valor === null) borrar.push(clave);
      else filas.push({ student_id: usuarioId, key: clave, value: { raw: valor }, updated_at: ahora });
    });
    try {
      if (filas.length) {
        const { error } = await window.sb.from(TABLA).upsert(filas, { onConflict: "student_id,key" });
        if (error) throw error;
      }
      if (borrar.length) {
        await window.sb.from(TABLA).delete().eq("student_id", usuarioId).in("key", borrar);
      }
    } catch (e) {
      // Si falla la red, se vuelve a intentar en el próximo cambio o al recargar.
      claves.forEach((c) => pendientes.add(c));
      console.warn("No se pudo guardar el progreso en tu cuenta:", e && e.message ? e.message : e);
    }
  }

  async function init() {
    if (listo) return usuarioId;
    try {
      if (!window.sb) { listo = true; return null; }
      const { data } = await window.sb.auth.getSession();
      usuarioId = data && data.session ? data.session.user.id : null;
      if (!usuarioId) { listo = true; return null; }

      const { data: filas, error } = await window.sb.from(TABLA).select("key, value").eq("student_id", usuarioId);
      if (error) throw error;

      const remoto = {};
      (filas || []).forEach((f) => { remoto[f.key] = f.value && typeof f.value.raw === "string" ? f.value.raw : null; });

      // Todas las claves de progreso que existan de un lado o del otro.
      const locales = [];
      try {
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          if (k && fusionDe(k)) locales.push(k);
        }
      } catch (e) {}
      const todas = new Set(locales.concat(Object.keys(remoto).filter((k) => fusionDe(k))));

      todas.forEach((clave) => {
        const fusion = fusionDe(clave);
        const local = leerLocal(clave);
        const nube = Object.prototype.hasOwnProperty.call(remoto, clave) ? remoto[clave] : null;
        const fusionado = fusion(local, nube);
        if (fusionado !== local) escribirLocal(clave, fusionado);
        if (fusionado !== nube) pendientes.add(clave);
      });

      listo = true;
      await sincronizar();
      return usuarioId;
    } catch (e) {
      // Nunca dejar a una página sin arrancar por culpa de la sincronización.
      console.warn("No se pudo leer el progreso de tu cuenta:", e && e.message ? e.message : e);
      listo = true;
      return usuarioId;
    }
  }

  intervenirAlmacenamiento();
  // Al salir o al mandar la página al fondo, se intenta guardar lo que quede.
  window.addEventListener("pagehide", () => { clearTimeout(temporizador); sincronizar(); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") { clearTimeout(temporizador); sincronizar(); }
  });

  return {
    init,
    sincronizar,
    hayCuenta: () => !!usuarioId,
    // Para pruebas y para páginas que quieran forzar el guardado de una clave.
    marcar: (clave) => { if (fusionDe(clave)) encolar(clave); },
    claves: () => CLAVES.slice(),
  };
})();
