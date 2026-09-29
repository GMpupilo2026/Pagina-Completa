/* ===== Ajedrez Integral — Catálogo de logros de Entrenamiento =====
 *
 * Todo lo que se puede "ganar" en Entrenamiento: la racha de días y las
 * medallas por progreso. No hay ninguna tabla de "logros desbloqueados": el
 * estado de cada uno se calcula siempre desde los mismos números que
 * devuelve `public.progreso_dias_y_racha()` (ver js/logros.js), igual que el
 * nivel del diagnóstico se calcula desde el resultado y no se guarda aparte.
 * Así un logro nunca puede quedar "a medias" por un guardado que falló.
 *
 * Van de sencillos a avanzados a propósito, en cuatro niveles (bronce, plata,
 * oro, diamante), para que siempre haya uno cerca de conseguirse.
 *
 * La racha usa `racha_record` (la más larga que se ha tenido), no
 * `racha_actual`: un logro ya ganado no se puede perder porque un día se
 * rompió la racha — "lo hecho, hecho está", el mismo criterio que ya usa
 * js/progreso-usuario.js para los ejercicios resueltos.
 */
window.LogrosCatalogo = (function () {
  "use strict";

  // Cuántos tipos de actividad de training_progress se pueden alcanzar de
  // verdad hoy. Son 22 en el CHECK de la base, pero 'desafios' está declarada
  // sin ningún uso real (entreno/desafios.html registra como 'practicar' —
  // ver CLAUDE.md) y 'preparacion' solo la tiene quien recibió un plan contra
  // un rival, así que exigirlas dejaría un logro que casi nadie puede
  // conseguir, y eso no daría ningún error: se quedaría gris para siempre sin
  // que nadie supiera por qué. Subió de 13 a 14 con 'finales' y a 15 con
  // 'tipos' (Tipos de entrenamiento): nadie tenía todavía las 14 (el máximo
  // era 12), así que nadie pierde la medalla. Y a 18 con 'precision-posicional',
  // 'sonar' y 'batalla-naval': el máximo seguía en 12. 'finales100' (la
  // práctica de los cursos de finales) NO sube la cuenta: esos cursos se
  // compran aparte y no todos los tienen. A 19 con 'memoria' (la ficha de
  // Memoria).
  const ACTIVIDADES_ALCANZABLES = 19;

  function hito(stats, clave) {
    return Number(stats.hitos && stats.hitos[clave]) || 0;
  }

  function porActividad(stats, clave) {
    return (stats.por_actividad && stats.por_actividad[clave]) || 0;
  }

  const LOGROS = [
    // ---------------- Racha de días (≥5 ejercicios el mismo día) ----------------
    { id: "racha_3", categoria: "racha", nivel: "bronce", emoji: "🔥", nombre: "Vas arrancando", descripcion: "3 días seguidos con al menos 5 ejercicios.", meta: 3, valor: (s) => s.racha_record },
    { id: "racha_7", categoria: "racha", nivel: "bronce", emoji: "🔥", nombre: "Una semana entera", descripcion: "7 días seguidos con al menos 5 ejercicios.", meta: 7, valor: (s) => s.racha_record },
    { id: "racha_14", categoria: "racha", nivel: "plata", emoji: "🔥", nombre: "Dos semanas seguidas", descripcion: "14 días seguidos con al menos 5 ejercicios.", meta: 14, valor: (s) => s.racha_record },
    { id: "racha_30", categoria: "racha", nivel: "plata", emoji: "🔥", nombre: "Un mes sin fallar", descripcion: "30 días seguidos con al menos 5 ejercicios.", meta: 30, valor: (s) => s.racha_record },
    { id: "racha_60", categoria: "racha", nivel: "oro", emoji: "🔥", nombre: "Dos meses de hierro", descripcion: "60 días seguidos con al menos 5 ejercicios.", meta: 60, valor: (s) => s.racha_record },
    { id: "racha_100", categoria: "racha", nivel: "oro", emoji: "🔥", nombre: "Cien días seguidos", descripcion: "100 días seguidos con al menos 5 ejercicios.", meta: 100, valor: (s) => s.racha_record },
    { id: "racha_200", categoria: "racha", nivel: "diamante", emoji: "🔥", nombre: "Racha de leyenda", descripcion: "200 días seguidos con al menos 5 ejercicios.", meta: 200, valor: (s) => s.racha_record },
    { id: "racha_365", categoria: "racha", nivel: "diamante", emoji: "🔥", nombre: "Un año entero", descripcion: "365 días seguidos con al menos 5 ejercicios.", meta: 365, valor: (s) => s.racha_record },

    // ---------------- Ejercicios resueltos en total ----------------
    { id: "ejercicios_10", categoria: "ejercicios", nivel: "bronce", emoji: "🧩", nombre: "Primeros pasos", descripcion: "10 ejercicios resueltos, de cualquier tipo.", meta: 10, valor: (s) => s.total_ejercicios },
    { id: "ejercicios_50", categoria: "ejercicios", nivel: "bronce", emoji: "🧩", nombre: "Agarrando ritmo", descripcion: "50 ejercicios resueltos.", meta: 50, valor: (s) => s.total_ejercicios },
    { id: "ejercicios_100", categoria: "ejercicios", nivel: "plata", emoji: "🧩", nombre: "Cien ejercicios", descripcion: "100 ejercicios resueltos.", meta: 100, valor: (s) => s.total_ejercicios },
    { id: "ejercicios_250", categoria: "ejercicios", nivel: "plata", emoji: "🧩", nombre: "250 ejercicios", descripcion: "250 ejercicios resueltos.", meta: 250, valor: (s) => s.total_ejercicios },
    { id: "ejercicios_500", categoria: "ejercicios", nivel: "oro", emoji: "🧩", nombre: "Medio millar", descripcion: "500 ejercicios resueltos.", meta: 500, valor: (s) => s.total_ejercicios },
    { id: "ejercicios_1000", categoria: "ejercicios", nivel: "oro", emoji: "🧩", nombre: "Mil ejercicios", descripcion: "1.000 ejercicios resueltos.", meta: 1000, valor: (s) => s.total_ejercicios },
    { id: "ejercicios_2500", categoria: "ejercicios", nivel: "diamante", emoji: "🧩", nombre: "2.500 ejercicios", descripcion: "2.500 ejercicios resueltos.", meta: 2500, valor: (s) => s.total_ejercicios },

    // ---------------- Variedad: cuántos tipos distintos ha probado ----------------
    { id: "variedad_3", categoria: "variedad", nivel: "bronce", emoji: "🎯", nombre: "Tocando de todo un poco", descripcion: "Practicaste 3 tipos distintos de ejercicio.", meta: 3, valor: (s) => s.tipos_distintos },
    { id: "variedad_6", categoria: "variedad", nivel: "plata", emoji: "🎯", nombre: "Todoterreno", descripcion: "Practicaste 6 tipos distintos de ejercicio.", meta: 6, valor: (s) => s.tipos_distintos },
    { id: "variedad_10", categoria: "variedad", nivel: "oro", emoji: "🎯", nombre: "Sabe de todo", descripcion: "Practicaste 10 tipos distintos de ejercicio.", meta: 10, valor: (s) => s.tipos_distintos },
    { id: "variedad_todo", categoria: "variedad", nivel: "diamante", emoji: "🎯", nombre: "Las probaste todas", descripcion: "Practicaste los " + ACTIVIDADES_ALCANZABLES + " tipos de ejercicio que hay.", meta: ACTIVIDADES_ALCANZABLES, valor: (s) => s.tipos_distintos },

    // ---------------- Días de práctica acumulados (no hace falta que sean seguidos) ----------------
    { id: "dias_10", categoria: "dias", nivel: "bronce", emoji: "📅", nombre: "Diez días de práctica", descripcion: "10 días distintos con al menos 5 ejercicios.", meta: 10, valor: (s) => s.dias_activos },
    { id: "dias_30", categoria: "dias", nivel: "plata", emoji: "📅", nombre: "Un mes de práctica", descripcion: "30 días distintos con al menos 5 ejercicios.", meta: 30, valor: (s) => s.dias_activos },
    { id: "dias_100", categoria: "dias", nivel: "oro", emoji: "📅", nombre: "Cien días de práctica", descripcion: "100 días distintos con al menos 5 ejercicios.", meta: 100, valor: (s) => s.dias_activos },

    // ---------------- Trofeos de la clase en vivo (se acumulan de clase en clase) ----------------
    { id: "trofeos_1", categoria: "trofeos", nivel: "bronce", emoji: "🏆", nombre: "Tu primer trofeo", descripcion: "Ganaste tu primer trofeo en clase.", meta: 1, valor: (s) => s.trofeos },
    { id: "trofeos_10", categoria: "trofeos", nivel: "bronce", emoji: "🏆", nombre: "Vitrina en marcha", descripcion: "Juntaste 10 trofeos en clase.", meta: 10, valor: (s) => s.trofeos },
    { id: "trofeos_25", categoria: "trofeos", nivel: "plata", emoji: "🏆", nombre: "Estante lleno", descripcion: "Juntaste 25 trofeos en clase.", meta: 25, valor: (s) => s.trofeos },
    { id: "trofeos_50", categoria: "trofeos", nivel: "plata", emoji: "🏆", nombre: "Medio centenar", descripcion: "Juntaste 50 trofeos en clase.", meta: 50, valor: (s) => s.trofeos },
    { id: "trofeos_100", categoria: "trofeos", nivel: "oro", emoji: "🏆", nombre: "Cien trofeos", descripcion: "Juntaste 100 trofeos en clase.", meta: 100, valor: (s) => s.trofeos },
    { id: "trofeos_250", categoria: "trofeos", nivel: "diamante", emoji: "🏆", nombre: "Sala de trofeos", descripcion: "Juntaste 250 trofeos en clase.", meta: 250, valor: (s) => s.trofeos },

    // ---------------- Insignias que el profesor da a mano en clase ----------------
    { id: "insignias_1", categoria: "insignias", nivel: "bronce", emoji: "🏅", nombre: "Tu primera insignia", descripcion: "Tu profesor te dio tu primera insignia en clase.", meta: 1, valor: (s) => s.insignias },
    { id: "insignias_5", categoria: "insignias", nivel: "bronce", emoji: "🏅", nombre: "Colección en marcha", descripcion: "Juntaste 5 insignias en clase.", meta: 5, valor: (s) => s.insignias },
    { id: "insignias_15", categoria: "insignias", nivel: "plata", emoji: "🏅", nombre: "Pecho lleno de medallas", descripcion: "Juntaste 15 insignias en clase.", meta: 15, valor: (s) => s.insignias },
    { id: "insignias_30", categoria: "insignias", nivel: "oro", emoji: "🏅", nombre: "Ejemplo de la clase", descripcion: "Juntaste 30 insignias en clase.", meta: 30, valor: (s) => s.insignias },
    { id: "insignias_60", categoria: "insignias", nivel: "diamante", emoji: "🏅", nombre: "Leyenda de la academia", descripcion: "Juntaste 60 insignias en clase.", meta: 60, valor: (s) => s.insignias },

    // ---------------- Por tipo de ejercicio ----------------
    { id: "mates_1", categoria: "mates", nivel: "bronce", emoji: "♚", nombre: "Tu primer mate", descripcion: "Resolviste tu primer ejercicio de Mates.", meta: 1, valor: (s) => porActividad(s, "mates") },
    { id: "mates_50", categoria: "mates", nivel: "plata", emoji: "♚", nombre: "Cazamates", descripcion: "50 ejercicios de Mates resueltos.", meta: 50, valor: (s) => porActividad(s, "mates") },
    { id: "mates_200", categoria: "mates", nivel: "oro", emoji: "♚", nombre: "Verdugo", descripcion: "200 ejercicios de Mates resueltos.", meta: 200, valor: (s) => porActividad(s, "mates") },
    { id: "cuatro_50", categoria: "4x4", nivel: "bronce", emoji: "🧮", nombre: "Calentando en el 4×4", descripcion: "50 ejercicios de 4×4 resueltos.", meta: 50, valor: (s) => porActividad(s, "4x4") },
    { id: "cuatro_200", categoria: "4x4", nivel: "plata", emoji: "🧮", nombre: "Máquina del 4×4", descripcion: "200 ejercicios de 4×4 resueltos.", meta: 200, valor: (s) => porActividad(s, "4x4") },
    { id: "cuatro_500", categoria: "4x4", nivel: "oro", emoji: "🧮", nombre: "Imparable en el 4×4", descripcion: "500 ejercicios de 4×4 resueltos.", meta: 500, valor: (s) => porActividad(s, "4x4") },
    { id: "temas_50", categoria: "temas", nivel: "plata", emoji: "🧠", nombre: "Conoce los temas", descripcion: "50 ejercicios de Ejercicios por tema resueltos.", meta: 50, valor: (s) => porActividad(s, "temas") },
    { id: "tactica_50", categoria: "tactica", nivel: "plata", emoji: "⚔️", nombre: "Ojo táctico", descripcion: "50 ejercicios de Táctica de ataque resueltos.", meta: 50, valor: (s) => porActividad(s, "tactica") },
    { id: "aprender_10", categoria: "aprender", nivel: "bronce", emoji: "🎓", nombre: "Primeras lecciones", descripcion: "10 lecciones de Aprende resueltas.", meta: 10, valor: (s) => porActividad(s, "aprender") },
    { id: "aprender_30", categoria: "aprender", nivel: "plata", emoji: "🎓", nombre: "Aplicado", descripcion: "30 lecciones de Aprende resueltas.", meta: 30, valor: (s) => porActividad(s, "aprender") },
    { id: "coordenadas_10", categoria: "coordenadas", nivel: "bronce", emoji: "⚡", nombre: "Rápido con las casillas", descripcion: "10 rondas de Coordenadas jugadas.", meta: 10, valor: (s) => porActividad(s, "coordenadas") },
    { id: "practicar_10", categoria: "practicar", nivel: "bronce", emoji: "🏋️", nombre: "En práctica", descripcion: "10 series de Practicar completadas.", meta: 10, valor: (s) => porActividad(s, "practicar") },
    { id: "concentracion_10", categoria: "concentracion", nivel: "bronce", emoji: "🧿", nombre: "Buena memoria", descripcion: "10 ejercicios de Concentración resueltos.", meta: 10, valor: (s) => porActividad(s, "concentracion") },
    { id: "diagnostico_1", categoria: "diagnostico", nivel: "bronce", emoji: "🧭", nombre: "Ya sabes tu nivel", descripcion: "Completaste tu primer diagnóstico de nivel.", meta: 1, valor: (s) => porActividad(s, "diagnostico") },
    { id: "aperturas_10", categoria: "aperturas", nivel: "bronce", emoji: "📖", nombre: "Memorizando líneas", descripcion: "10 líneas de Aperturas y celadas repasadas.", meta: 10, valor: (s) => porActividad(s, "aperturas") },
    { id: "confites_1", categoria: "confites", nivel: "bronce", emoji: "🐴", nombre: "A por los confites", descripcion: "Jugaste tu primera ronda de Confites del caballo.", meta: 1, valor: (s) => porActividad(s, "confites") },
    { id: "ilumina_5", categoria: "ilumina", nivel: "bronce", emoji: "💡", nombre: "Se hizo la luz", descripcion: "5 niveles de Ilumina el tablero resueltos.", meta: 5, valor: (s) => porActividad(s, "ilumina") },
    { id: "visualizacion_10", categoria: "visualizacion", nivel: "bronce", emoji: "👁️", nombre: "Lo ves sin mirar", descripcion: "10 ejercicios de Visualización resueltos.", meta: 10, valor: (s) => porActividad(s, "visualizacion") },
    { id: "finales_5", categoria: "finales", nivel: "plata", emoji: "🏁", nombre: "Final de libro", descripcion: "5 finales contra la máquina ganados o salvados.", meta: 5, valor: (s) => porActividad(s, "finales") },
    { id: "sonar_10", categoria: "sonar", nivel: "bronce", emoji: "🔊", nombre: "Cazatesoros", descripcion: "Encontraste el tesoro en 10 partidas del Sonar.", meta: 10, valor: (s) => porActividad(s, "sonar") },
    { id: "sonar_3estrellas", categoria: "sonar", nivel: "plata", emoji: "🔊", nombre: "Oído fino", descripcion: "5 tesoros del Sonar encontrados con tres estrellas.", meta: 5, valor: (s) => hito(s, "tesoros_3") },
    { id: "batalla_10", categoria: "batalla-naval", nivel: "bronce", emoji: "🚢", nombre: "A toda vela", descripcion: "10 partidas de Batalla naval terminadas.", meta: 10, valor: (s) => porActividad(s, "batalla-naval") },
    { id: "batalla_duelo", categoria: "batalla-naval", nivel: "plata", emoji: "🚢", nombre: "Almirante", descripcion: "Le ganaste un duelo de Batalla naval a la computadora.", meta: 1, valor: (s) => hito(s, "duelos_ganados") },
    { id: "precision_70", categoria: "precision-posicional", nivel: "oro", emoji: "🧭", nombre: "Ojo de estratega", descripcion: "3 tandas de Precisión posicional con 70 % o más.", meta: 3, valor: (s) => hito(s, "tandas_70") },
    { id: "memoria_10", categoria: "memoria", nivel: "bronce", emoji: "📷", nombre: "Retratista", descripcion: "10 posiciones de Memoria reconstruidas.", meta: 10, valor: (s) => porActividad(s, "memoria") },
    { id: "memoria_12", categoria: "memoria", nivel: "oro", emoji: "📷", nombre: "Memoria fotográfica", descripcion: "Reconstruiste una posición de 12 piezas sin un error.", meta: 12, valor: (s) => hito(s, "memoria_max_limpia") },
    { id: "tipos_20", categoria: "tipos", nivel: "bronce", emoji: "🧩", nombre: "De todos los tipos", descripcion: "20 ejercicios de Tipos de entrenamiento resueltos.", meta: 20, valor: (s) => porActividad(s, "tipos") },
    { id: "tipos_completo_1", categoria: "tipos", nivel: "plata", emoji: "🧩", nombre: "Tipo dominado", descripcion: "Completaste un Tipo de entrenamiento entero: todos sus ejercicios con al menos una estrella.", meta: 1, valor: (s) => s.tipos_completos },
    { id: "tipos_completo_5", categoria: "tipos", nivel: "oro", emoji: "🧩", nombre: "Cinco tipos dominados", descripcion: "Completaste cinco Tipos de entrenamiento enteros.", meta: 5, valor: (s) => s.tipos_completos },
    { id: "tipos_completo_10", categoria: "tipos", nivel: "diamante", emoji: "🧩", nombre: "Diez tipos dominados", descripcion: "Completaste diez Tipos de entrenamiento enteros.", meta: 10, valor: (s) => s.tipos_completos },
  ];

  // Le agrega a cada logro su estado con los números de este alumno: cuánto
  // lleva, si ya lo consiguió y qué tan cerca está (0 a 1). Es una función
  // pura — el mismo `stats` siempre da el mismo resultado — a propósito: no
  // hay "logro desbloqueado" que guardar en ningún lado.
  function conEstado(stats) {
    return LOGROS.map((l) => {
      const valor = Math.max(0, Math.round(l.valor(stats) || 0));
      const conseguido = valor >= l.meta;
      return Object.assign({}, l, { valor: valor, conseguido: conseguido, progreso: Math.min(1, valor / l.meta) });
    });
  }

  return { LOGROS: LOGROS, conEstado: conEstado, ACTIVIDADES_ALCANZABLES: ACTIVIDADES_ALCANZABLES };
})();
