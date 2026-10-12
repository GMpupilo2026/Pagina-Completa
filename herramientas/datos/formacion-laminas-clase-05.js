/* Lo que se VE en cada lámina de la Clase 5 de Formación Ajedrez.
 *
 * Una entrada por lámina, en el mismo orden que
 * cursos/recursos/formacion-ajedrez/presentaciones/clase-05/diapositivas.json.
 * El título grande sale del `titulo` de ese archivo; esta clase no tiene
 * tableros. La transcripción completa sigue en el `texto` del JSON, y la
 * lámina dice poco a propósito (ver «Las láminas dicen poco» en
 * docs/decisiones/clase-en-vivo.md).
 *
 * Tonos de una marca: "si" (verde), "no" (rojo), "ojo" (ámbar), "info" (azul). El color
 * nunca va solo: la marca lleva siempre su palabra escrita.
 */
module.exports = [
  // 1
  { tipo: "portada", k: "Formación de Personas Árbitras y Asesoras · JDE",
    t: "Sesión 5", s: "Resolución de casos en grupos y experiencias regionales" },
  // 2
  { tipo: "filas", k: "Al terminar la sesión podrás…", items: [
    { ic: "🧩", t: "Resolver casos complejos", s: "hechos, artículo, decisión y registro" },
    { ic: "🗓️", t: "Planificar la logística", s: "antes, durante y después de las rondas" },
    { ic: "🗣️", t: "Comunicar decisiones", s: "a estudiantes, familias y docentes" },
    { ic: "📝", t: "Redactar el informe", s: "de una incidencia" } ] },
  // 3
  { tipo: "crono", k: "4 horas · 240 minutos", items: [
    ["0:00", "Repaso y tarea"],
    ["0:10", "Método para resolver un caso"],
    ["0:45", "Logística de un torneo"],
    ["1:20", "Receso", true],
    ["1:30", "Casos integradores en grupos"],
    ["2:20", "Plenaria de soluciones"],
    ["2:55", "Receso", true],
    ["3:05", "Fortalecer el desempeño"],
    ["3:30", "Quiz de la sesión"],
    ["3:50", "Cierre"] ] },
  // 4
  { tipo: "tarjetas", k: "Ni de memoria ni por presión", cols: 4, numerar: true, items: [
    { ic: "🔍", t: "Hechos", s: "qué pasó, en qué orden, con qué pruebas" },
    { ic: "📖", t: "Artículo", s: "Leyes FIDE y normativa, o la más cercana" },
    { ic: "⚖️", t: "Decisión", s: "clara, proporcionada y comunicada" },
    { ic: "🗂️", t: "Registro", s: "acta e informe del torneo" } ],
    clave: "Un caso bien resuelto se puede explicar y defender." },
  // 5
  { tipo: "filas", k: "Casi todo se evita antes de la primera ronda", items: [
    { ic: "🪪", t: "Acreditación con la Boleta Oficial", s: "sin los datos completos no se recibe", a: "27 y 28" },
    { ic: "🤝", t: "Congresillo técnico", s: "sistema, ritmo y desempates, en el acta", a: "33, 34 y 66.4" },
    { ic: "🧑‍⚖️", t: "Árbitro mayor de edad", s: "Circuital, Regional e Interregional", a: "14" },
    { ic: "📋", t: "Lista inicial publicada", s: "con rondas y desempates" },
    { ic: "🏫", t: "Sala preparada", s: "luz, mesas numeradas, público aparte" } ] },
  // 6
  { tipo: "chips", k: "Materiales: revisados y configurados", items: [
    { ic: "🔲", t: "Tableros" }, { ic: "pieza:wN", t: "Piezas" },
    { ic: "⏱️", t: "Relojes" }, { ic: "🧰", t: "Repuestos" },
    { ic: "📋", t: "Planillas" }, { ic: "🗂️", t: "Actas" },
    { ic: "📝", t: "Formularios" } ] },
  // 7
  { tipo: "receso" },
  // 8
  { tipo: "ciclo", k: "Ronda a ronda, el mismo orden",
    pasos: ["Publicar el pareo", "Iniciar puntual", "Observar el apuro", "Recoger resultados", "Emparejar la siguiente"],
    items: [
      { ic: "✍️", t: "Resultados firmados y revisados", s: "e ingresados antes de emparejar la ronda siguiente" },
      { ic: "🏆", t: "Al final", s: "tabla con desempates, acta, informe de incidencias y premiación" } ] },
  // 9
  { tipo: "dos", k: "Te escuchan estudiantes, familias, docentes",
    izq: { t: "Con los jugadores", items: [
      ["Primero con los dos", ""],
      ["En voz baja, lejos de otras mesas", ""],
      ["Regla y artículo, sin discutir la posición", ""] ] },
    der: { t: "Con familias y público", items: [
      ["No intervienen en las partidas", ""],
      ["Se les atiende fuera de la sala", ""],
      ["Apelación: ante quién y en qué plazo", ""] ] },
    clave: "Correcta pero mal comunicada: tanto conflicto como una incorrecta." },
  // 10
  { tipo: "filas", k: "Caso 1 · La ronda que empezó tarde", items: [
    { ic: "⏰", t: "Llega 5 minutos tarde", s: "tolerancia: 10; la ronda salió 20 minutos tarde" },
    { ic: "pieza:wR", t: "El rival completa una jugada ilegal", s: "suizo escolar a 15 min + 5 s" },
    { ic: "📱", t: "Suena el celular del que llegó tarde", s: "el reglamento lo sanciona con la pérdida" } ] },
  // 11
  { tipo: "tarjetas", k: "Caso 1 · La ronda que empezó tarde", items: [
    { ic: "⏰", t: "Juega", s: "llegó dentro de la tolerancia, con 5 minutos menos", tono: "si" },
    { ic: "↩️", t: "Ilegal: se corrige", s: "se repone la posición y quien llegó tarde recibe 1 minuto", tono: "ojo" },
    { ic: "📱", t: "Celular: pierde", s: "según el reglamento", tono: "no" } ],
    clave: "Todo al acta, y se revisa por qué la ronda salió tarde." },
  // 12
  { tipo: "frase", k: "Caso 2 · Empate en el primer lugar", ic: "🏆",
    t: "Dos estudiantes empatan el primer lugar… y su partida también fue tablas.",
    s: "Todos contra todos de 6. Bases: encuentro directo, Sonneborn-Berger y número de victorias." },
  // 13
  { tipo: "filas", k: "Caso 2 · Empate en el primer lugar", escalera: true, items: [
    { ic: "🤝", t: "Encuentro directo", s: "no los separa" },
    { ic: "🧮", t: "Sonneborn-Berger", s: "como en el ejemplo de la sesión 3" },
    { ic: "🏅", t: "Número de victorias", s: "si siguen empatados" },
    { ic: "🎲", t: "Sorteo", s: "si todo se agota, salvo que las bases digan otra cosa" } ] },
  // 14
  { tipo: "frase", k: "Caso 3 · La logística que falló", ic: "🧰",
    t: "Faltan 4 relojes y 3 tableros tienen piezas incompletas.",
    s: "Está por empezar la ronda 1, con 30 estudiantes inscritos." },
  // 15
  { tipo: "tarjetas", k: "Caso 3 · La logística que falló", cols: 4, compacto: true, items: [
    { ic: "🧰", t: "Repuestos", s: "se usan los que hay" },
    { ic: "pieza:wN", t: "Piezas", s: "de otros juegos, revisando cada tablero" },
    { ic: "⏱️", t: "Mesas sin reloj", s: "control anunciado, o junto a la mesa de control" },
    { ic: "📝", t: "Registro", s: "y repuestos en la lista del día presencial" } ],
    clave: "Se reorganiza sin perder la puntualidad." },
  // 16
  { tipo: "receso" },
  // 17
  { tipo: "frase", k: "Trabajo en grupos", ic: "👥",
    t: "Analicen un caso integrador y presenten su solución fundamentada.",
    s: "Combina reglas de competición, desempates y logística." },
  // 18
  { tipo: "ciclo", k: "El método, con un caso ya conocido",
    pasos: ["Hechos", "Artículo", "Decisión", "Registro"],
    items: [
      { ic: "📱", t: "El caso «suena un celular»", s: "el de la sesión 2" },
      { ic: "📝", t: "Redacta el registro", s: "tal como irá en el acta" } ] },
  // 19
  { tipo: "frase", k: "Logística", ic: "📋",
    t: "Escribe la lista de materiales.",
    s: "Para un torneo de 40 estudiantes: 20 mesas." },
  // 20
  { tipo: "frase", k: "Desde el público", ic: "👀",
    t: "Un familiar le señala a su hija una jugada.",
    s: "¿Qué haces?" },
  // 21
  { tipo: "tarjetas", k: "Ejercicios 1 a 3", cols: 3, compacto: true, numerar: true, items: [
    { ic: "📱", t: "Pierde la partida", s: "o la sanción menor del reglamento; al acta con ronda, mesa y firma", a: "11.3.2" },
    { ic: "🧰", t: "20 de cada uno", s: "tableros, piezas y relojes, + 2 o 3 de repuesto; planillas y actas" },
    { ic: "🚷", t: "Se retira al familiar", s: "si hubo ayuda, sanción a la jugadora (12.9)", a: "11.3.1 y 12.7" } ] },
  // 22
  { tipo: "tarjetas", k: "Responde de forma individual", cols: 4, compacto: true, numerar: true, items: [
    { t: "¿Qué NO es logística previa?" },
    { t: "Sin regla exacta: ¿qué prima?" },
    { t: "¿Los cuatro pasos de un caso?" },
    { t: "¿Qué se revisa antes de emparejar?" },
    { t: "¿Dónde se atiende al público?" },
    { t: "¿Qué más anuncian las bases?" },
    { t: "¿Dónde y cómo se comunica una decisión?" } ] },
  // 23
  { tipo: "tarjetas", k: "Responde de forma individual", items: [
    { ic: "8️⃣", t: "Quiere apelar: ¿qué le informas?" },
    { ic: "9️⃣", t: "¿Qué se arma al cerrar el torneo?" } ] },
  // 24
  { tipo: "filas", cols: 3, numerar: true, items: [
    { t: "El resultado final de las partidas" },
    { t: "Lo más cercano, con imparcialidad" },
    { t: "Hechos, artículo, decisión y registro" },
    { t: "Resultados firmados, revisados e ingresados" },
    { t: "Fuera de la sala de juego" },
    { t: "Los desempates y su orden" },
    { t: "Con los dos, en voz baja y aparte" },
    { t: "Ante quién y en qué plazo" },
    { t: "Tabla, acta, informe y premiación" } ] },
  // 25
  { tipo: "tarjetas", k: "Antes de la próxima sesión", items: [
    { ic: "📚", t: "Tarea", s: "propuesta logística breve para un torneo de tu región: inscripción, espacios, materiales y personal" },
    { ic: "👋", t: "¿Dudas?", s: "este es el momento. ¡Gracias por participar!" } ] },
];
