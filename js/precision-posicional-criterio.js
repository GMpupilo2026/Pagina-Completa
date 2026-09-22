/* ===== Ajedrez Integral — Criterio del Evaluador de precisión posicional =====
 *
 * Qué mide cada área y qué conviene repasar si sale floja. Lo usa
 * entreno/precision-posicional.html y está separado del banco de posiciones
 * a propósito, como ya hacen js/arbitraje-nivel.js y js/plan-entrenamiento.js:
 * el criterio se puede ajustar sin tocar los ítems, y al revés.
 *
 * A diferencia del examen de arbitraje o del diagnóstico de nivel, ACÁ NO HAY
 * NINGÚN NIVEL NI TÍTULO QUE ESTIMAR. No existe un "elo posicional" que se
 * pueda medir con un puñado de preguntas: lo único honesto que se puede decir
 * es cuánto se acertó, por área, y dar un veredicto en palabras — nunca un
 * número de nivel que suene más preciso de lo que en realidad es.
 */
window.PrecisionPosicionalCriterio = (function () {
  "use strict";

  const AREAS = [
    {
      id: "mejorar_pieza", nombre: "Mejorar la peor pieza", emoji: "🐎",
      mide: "Reconocer cuál es la pieza propia peor colocada y encontrarle una ruta o un puesto mejor.",
      estudiar: "Antes de calcular nada, compara tus cuatro piezas menores y mayores con las del rival: la peor tuya es casi siempre la prioridad, no la mejor.",
    },
    {
      id: "columnas_diagonales", nombre: "Columnas y diagonales abiertas", emoji: "🗼",
      mide: "Decidir cuándo abrir, ocupar o disputar una columna o una diagonal antes de que lo haga el rival.",
      estudiar: "Una columna o diagonal que se va a abrir se ocupa primero con la torre o el alfil, no después de que el rival ya esté ahí.",
    },
    {
      id: "cambios", nombre: "Qué cambiar y qué conservar", emoji: "⚖️",
      mide: "Elegir qué pieza propia cambiar y cuál conservar, según sea buena o mala, activa o pasiva.",
      estudiar: "La regla de siempre: se cambian las piezas malas propias por las piezas buenas rivales, nunca al revés.",
    },
    {
      id: "debilidades", nombre: "Fijar y atacar una debilidad", emoji: "🎯",
      mide: "Identificar un peón o una casilla débil en el bando rival y armar el plan para presionarla con calma.",
      estudiar: "Una debilidad casi nunca se gana de una jugada: se acumula presión, pieza por pieza, hasta que el rival no puede seguir defendiéndola.",
    },
    {
      id: "espacio_restriccion", nombre: "Espacio y restricción", emoji: "🧱",
      mide: "Sostener un peón avanzado o una mayoría de peones para quitarle casillas y movilidad al rival.",
      estudiar: "Un peón avanzado y bien sostenido no es una debilidad: es la base de una ventaja de espacio que hay que mantener, no cambiar por miedo.",
    },
    {
      id: "flanco_ataque", nombre: "Elegir el flanco de ataque", emoji: "🏰",
      mide: "Decidir con qué —peones o piezas— y en qué flanco atacar, según en qué lado esté cada rey.",
      estudiar: "Con los reyes en flancos opuestos, los peones atacan; con los reyes en el mismo flanco, atacan las piezas y los peones propios se tocan lo menos posible.",
    },
    {
      id: "estructura", nombre: "Decisiones de estructura de peones", emoji: "♟️",
      mide: "Evaluar si conviene aceptar un peón aislado o doblado, o cambiar en una casilla concreta, a cambio de otra ventaja.",
      estudiar: "Un peón aislado o doblado no es automáticamente malo: se juzga contra lo que se gana a cambio (espacio, una columna, actividad de piezas).",
    },
    {
      id: "final_transformacion", nombre: "Transformar la ventaja en el final", emoji: "👑",
      mide: "Activar el rey y convertir una mayoría de peones en un peón pasado cuando el medio juego se termina.",
      estudiar: "En el final el rey es una pieza de ataque, no una pieza para esconder: actívalo hacia donde esté la mayoría de peones propia.",
    },
  ];
  const AREA_POR_ID = {};
  AREAS.forEach((a) => { AREA_POR_ID[a.id] = a; });

  /* Bandas del veredicto — en palabras, nunca solo en un número o un color,
     la misma regla que sigue el resto del sitio para cualquier resultado. */
  function veredicto(porcentaje, total) {
    if (!total) return { etiqueta: "Sin datos todavía", texto: "Todavía no respondiste ninguna posición." };
    if (porcentaje >= 85) return { etiqueta: "Visión posicional firme", texto: `Acertaste ${porcentaje}%: reconoces el plan correcto en la gran mayoría de estructuras clásicas.` };
    if (porcentaje >= 60) return { etiqueta: "En camino, con algo que pulir", texto: `Acertaste ${porcentaje}%: el criterio general está, pero conviene repasar las áreas más flojas de abajo.` };
    if (porcentaje >= 40) return { etiqueta: "Todavía cuesta ver el plan correcto", texto: `Acertaste ${porcentaje}%: antes de seguir jugando conviene repasar los planes típicos, uno por uno.` };
    return { etiqueta: "Conviene volver a los planes clásicos", texto: `Acertaste ${porcentaje}%: es el momento de estudiar cada estructura por separado, no de seguir practicando a ciegas.` };
  }

  /* `detalle.areas` = { [id del área]: { aciertos, total } }, como lo arma la
     página al corregir. Un área sin ninguna pregunta contestada en esta tanda
     queda con total 0 y no se pinta en la lista de "a reforzar" ni en la de
     "firmes": no hay con qué opinar de un área que no se preguntó. */
  function resumir(detalle) {
    const areas = (detalle && detalle.areas) || {};
    const porAreaLista = AREAS.map((a) => {
      const d = areas[a.id] || { aciertos: 0, total: 0 };
      return {
        id: a.id, nombre: a.nombre, emoji: a.emoji, mide: a.mide, estudiar: a.estudiar,
        aciertos: d.aciertos || 0, total: d.total || 0,
        porcentaje: d.total ? Math.round((d.aciertos / d.total) * 100) : null,
      };
    });
    const conDatos = porAreaLista.filter((a) => a.total > 0);
    const aciertos = conDatos.reduce((s, a) => s + a.aciertos, 0);
    const total = conDatos.reduce((s, a) => s + a.total, 0);
    const porcentaje = total ? Math.round((aciertos / total) * 100) : 0;
    const ordenadas = conDatos.slice().sort((a, b) => a.porcentaje - b.porcentaje);
    return {
      porArea: porAreaLista, aciertos, total, porcentaje,
      veredicto: veredicto(porcentaje, total),
      aReforzar: ordenadas.filter((a) => a.porcentaje < 60).slice(0, 3),
      firmes: ordenadas.slice().reverse().filter((a) => a.porcentaje >= 85),
      fecha: (detalle && detalle.fecha) || null,
    };
  }

  return { AREAS: AREAS, AREA_POR_ID: AREA_POR_ID, veredicto: veredicto, resumir: resumir };
})();
