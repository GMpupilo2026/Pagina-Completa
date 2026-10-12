/* Lo que se VE en cada lámina de la Clase 2 de Formación Ajedrez
 * (reglas de competición).
 *
 * Una entrada por lámina, en el mismo orden que
 * cursos/recursos/formacion-ajedrez/presentaciones/clase-02/diapositivas.json.
 * El título grande sale del `titulo` de ese archivo; acá va solo lo demás.
 * Esta sesión no tiene tableros. Los casos van en dos láminas: «¿Qué
 * decide…?» con la situación y «Decisión» con la respuesta.
 *
 * Una lámina dice poco a propósito (ver «Las láminas dicen poco» en
 * docs/decisiones/clase-en-vivo.md): la transcripción completa sigue en el
 * `texto` del JSON. Tonos: "si" (verde), "no" (rojo), "ojo" (ámbar),
 * "info" (azul), siempre junto a una palabra que diga lo mismo.
 */
module.exports = [
  // 1
  { tipo: "portada", k: "Formación de Personas Árbitras y Asesoras · JDE",
    t: "Sesión 2", s: "Reglas de competición" },
  // 2
  { tipo: "filas", k: "Al terminar la sesión podrás…", items: [
    { ic: "🚪", t: "Aplicar las normas de conducta", s: "en la zona de juego" },
    { ic: "📵", t: "Resolver incidencias con dispositivos", s: "art. 11.3 y reglamento del torneo" },
    { ic: "↩️", t: "Tratar las irregularidades", s: "con el procedimiento del art. 7" },
    { ic: "⚖️", t: "Elegir una sanción proporcionada", s: "del art. 12.9" },
    { ic: "📋", t: "Atender un reclamo completo", s: "escuchar, verificar, decidir y registrar" } ] },
  // 3
  { tipo: "crono", k: "4 horas · 240 minutos", items: [
    ["0:00", "Repaso y revisión de la tarea"],
    ["0:10", "Conducta y zona de juego"],
    ["0:45", "Dispositivos electrónicos"],
    ["1:10", "Receso", true],
    ["1:20", "Irregularidades"],
    ["1:55", "Sanciones, reclamos y apelaciones"],
    ["2:20", "Receso", true],
    ["2:30", "Simulación de reclamos en salas"],
    ["3:15", "Quiz y revisión"],
    ["3:45", "Cierre"] ] },
  // 4
  { tipo: "tarjetas", k: "Lo que no se hace durante la ronda", cols: 3, compacto: true, items: [
    { ic: "♟️", t: "Desprestigiar el juego", s: "cubre lo no previsto" },
    { ic: "🚪", t: "Salir sin permiso", s: "de la zona de juego" },
    { ic: "📝", t: "Usar notas o consejos", s: "ni analizar en otro tablero" },
    { ic: "👀", t: "Interferir tras terminar", s: "ya es espectador" },
    { ic: "🔁", t: "Molestar al rival", s: "ni ofrecer tablas sin parar" },
    { ic: "🤐", t: "Comentar una partida", s: "que se sigue jugando" } ] },
  // 5
  { tipo: "filas", k: "Lo que cuenta es tenerlo, no que suene", items: [
    { ic: "📴", t: "Apagado cuenta igual", s: "no puede tenerlo encima" },
    { ic: "🟥", t: "Pierde la partida", s: "salvo sanción menor en el reglamento", tono: "no" },
    { ic: "👜", t: "En el bolso, completamente apagado", s: "si el reglamento lo permite" },
    { ic: "🔍", t: "Ante una sospecha, revisión", s: "siempre en privado" } ],
    clave: "En la charla técnica, di dónde van los teléfonos." },
  // 6
  { tipo: "dos", k: "La jugada ilegal se completa al presionar el reloj",
    izq: { t: "Antes del reloj", items: [
      ["Se corrige sin sanción", ""],
      ["La pieza tocada sigue obligando", "", "ojo"] ] },
    der: { t: "Ya completada", items: [
      ["Se repone la posición anterior", ""],
      ["1.ª: +2 min al rival (+1 en rápidas)", "", "ojo"],
      ["2.ª: pierde (tablas si el rival no puede dar mate)", "", "no"] ] },
    clave: "Sin posición anterior: desde la última identificable." },
  // 7
  { tipo: "tarjetas", k: "Piezas desplazadas y reloj", items: [
    { ic: "✋", t: "Quien las vuelca, las repone", s: "con su propio tiempo" },
    { ic: "🟨", t: "Puede haber sanción", s: "el árbitro puede, pero no está obligado" },
    { ic: "⏱️", t: "El árbitro fija el reloj", s: "con su criterio, y puede ajustar el contador de jugadas" } ] },
  // 8
  { tipo: "receso" },
  // 9
  { tipo: "filas", k: "Art. 12.9 · de la más suave a la más dura", escalera: true, items: [
    { ic: "🗣️", t: "Advertencia" },
    { ic: "⏱️", t: "Ajuste de tiempo", s: "más al rival o menos al infractor" },
    { ic: "🔢", t: "Ajuste de puntos", s: "menos al infractor o más al rival" },
    { ic: "🏳️", t: "Partida perdida" },
    { ic: "🚫", t: "Multa, exclusión o expulsión", s: "de una o más rondas o de la competición" } ],
    clave: "Se elige la proporcionada." },
  // 10
  { tipo: "ciclo", k: "Un reclamo, de principio a fin",
    pasos: ["Pausa el reloj", "Escucha a las dos partes", "Verifica los hechos", "Decide con el artículo", "Registra"],
    items: [
      { ic: "❓", t: "Derecho a que le expliquen la regla", s: "reanudar lo decide el árbitro" },
      { ic: "✋", t: "Si tocó una pieza, no reclama", s: "la pieza tocada del rival (4.1 a 4.7)" },
      { ic: "✒️", t: "Firmar no impide apelar", s: "plazos y forma: los da el reglamento" } ] },
  // 11
  { tipo: "frase", k: "Caso 1 · Suena un celular", ic: "📱",
    t: "En plena ronda suena el celular de un jugador dentro de la sala.",
    s: "El reglamento del torneo no dice nada sobre dispositivos." },
  // 12
  { tipo: "frase", k: "Caso 1 · Suena un celular", ic: "🟥", tono: "no",
    t: "Pierde la partida",
    s: "Es la regla general. Solo si el reglamento previera una sanción menor, se aplicaría esa.",
    a: "11.3.2" },
  // 13
  { tipo: "frase", k: "Caso 2 · Primera jugada ilegal en ritmo clásico", ic: "pieza:wK",
    t: "Un jugador deja su rey en jaque y presiona el reloj.",
    s: "Es su primera jugada ilegal de la partida." },
  // 14
  { tipo: "frase", k: "Caso 2 · Primera jugada ilegal en ritmo clásico", ic: "↩️",
    t: "Se repone la posición anterior y el rival recibe 2 minutos más",
    s: "El jugador hace una jugada legal, respetando la pieza tocada." },
  // 15
  { tipo: "frase", k: "Caso 3 · La misma situación en rápidas", ic: "⏱️",
    t: "La misma jugada ilegal, en un torneo a 15 minutos más 10 segundos." },
  // 16
  { tipo: "frase", k: "Caso 3 · La misma situación en rápidas", ic: "⏱️",
    t: "Mismo procedimiento, pero el rival recibe 1 minuto en lugar de 2",
    s: "Una segunda jugada ilegal le haría perder la partida." },
  // 17
  { tipo: "frase", k: "Caso 4 · Notas de apertura", ic: "📄",
    t: "Un jugador consulta una hoja con variantes de apertura durante la partida." },
  // 18
  { tipo: "frase", k: "Caso 4 · Notas de apertura", ic: "🚫",
    t: "Prohibido usar cualquier fuente de información",
    s: "Se sanciona según la gravedad: puede llegar a la pérdida de la partida.",
    a: "12.9" },
  // 19
  { tipo: "frase", k: "Caso 5 · Análisis en la sala", ic: "♟️",
    t: "Dos estudiantes que ya terminaron analizan su partida junto a mesas que siguen jugando." },
  // 20
  { tipo: "frase", k: "Caso 5 · Análisis en la sala", ic: "👀",
    t: "Ya son espectadores y no pueden interferir",
    s: "Se les pide ir a la sala de análisis o salir; si insisten, hay sanción." },
  // 21
  { tipo: "frase", k: "Caso 6 · Piezas volcadas", ic: "⏳",
    t: "En apuro de tiempo, un jugador vuelca varias piezas y presiona el reloj sin reponerlas." },
  // 22
  { tipo: "frase", k: "Caso 6 · Piezas volcadas", ic: "✋",
    t: "Las repone con su propio tiempo",
    s: "El rival puede pausar el reloj y llamar al árbitro. Si lo repite, sanción por conducta." },
  // 23
  { tipo: "receso" },
  // 24
  { tipo: "tarjetas", k: "Simulación en subgrupos", numerar: true, items: [
    { ic: "👥", t: "En subgrupos", s: "una sala por grupo" },
    { ic: "🧑‍⚖️", t: "Cada quien arbitra", s: "un reclamo distinto" },
    { ic: "📖", t: "Lo resuelve", s: "con el procedimiento correcto" } ] },
  // 25
  { tipo: "frase", k: "Práctica en salas", ic: "↩️",
    t: "Hace una jugada ilegal, se da cuenta antes de presionar el reloj y la corrige moviendo otra pieza.",
    s: "¿Qué decides?" },
  // 26
  { tipo: "frase", k: "Práctica en salas · ritmo clásico", ic: "pieza:wK",
    t: "Un jugador completa su segunda jugada ilegal. Su rival solo tiene el rey.",
    s: "¿Resultado?" },
  // 27
  { tipo: "frase", k: "Práctica en salas", ic: "🤝",
    t: "Un jugador ofrece tablas tres veces en diez jugadas pese a las negativas.",
    s: "¿Cómo actúas?" },
  // 28
  { tipo: "frase", k: "Práctica en salas", ic: "📳",
    t: "El reglamento permite guardar el celular en el bolso. Durante la partida, vibra.",
    s: "¿Qué decides?" },
  // 29
  { tipo: "frase", k: "Práctica en salas", ic: "🔄",
    t: "A las 12 jugadas de cada bando se descubre que los colores están invertidos.",
    s: "¿Qué se hace?" },
  // 30
  { tipo: "frase", k: "Práctica en salas", ic: "✒️",
    t: "Un jugador firma la planilla y luego quiere apelar tu decisión.",
    s: "¿Puede?" },
  // 31
  { tipo: "tabla", k: "Ejercicios 1 a 5, cada uno con su artículo", cab: ["Ejercicio", "Decisión", "Por qué"], filas: [
    ["1. Antes del reloj", "4.3 y 7.5.1", "Sin sanción", "si", "pero con la pieza que tocó"],
    ["2. Segunda ilegal", "7.5.5", "Tablas", "ojo", "el rival no puede dar mate"],
    ["3. Tablas tres veces", "11.5 y 12.9", "Advertencia", "ojo", "si sigue, sanción mayor"],
    ["4. Vibra en el bolso", "11.3.2", "Sanción", "no", "no estaba completamente apagado"],
    ["5. Colores invertidos", "7.3", "Sigue", "info", "ya van 10 o más jugadas cada uno"] ] },
  // 32
  { tipo: "frase", k: "Ejercicio 6 · firmar y apelar", ic: "✒️", tono: "si",
    t: "Sí: firmar no quita el derecho a apelar",
    s: "Los plazos y la forma los fija el reglamento del torneo.",
    a: "8.7 y 11.10" },
  // 33
  { tipo: "filas", k: "Preguntas 1 a 7 · un minuto cada una", cols: 2, numerar: true, items: [
    { t: "Tocó una pieza propia movible: ¿qué hace?" },
    { t: "Dispositivo no autorizado: ¿qué hace el árbitro?" },
    { t: "¿Cuándo queda completada una jugada ilegal?" },
    { t: "En rápidas, ¿cuánto recibe el rival por la 1.ª?" },
    { t: "¿Con qué tiempo repone las piezas volcadas?" },
    { t: "¿Primera sanción del art. 12.9?" },
    { t: "¿Qué necesita para salir de la sala?" } ] },
  // 34
  { tipo: "filas", k: "Preguntas 8 a 11", items: [
    { ic: "♟️", t: "8. Ya terminó: ¿puede analizar en un tablero de la sala?" },
    { ic: "🧩", t: "9. Sin posición anterior a la ilegal: ¿desde dónde sigue?" },
    { ic: "🚫", t: "10. ¿La sanción más severa del art. 12.9?" },
    { ic: "✋", t: "11. Tocó una pieza para capturar: ¿puede reclamar pieza tocada?" } ] },
  // 35
  { tipo: "filas", k: "Preguntas 1 a 9", cols: 3, numerar: true, items: [
    { t: "La mueve", s: "si tiene jugada legal" },
    { t: "Aplica la sanción", s: "del reglamento de competición" },
    { t: "Al poner en marcha el reloj del rival" },
    { t: "Un minuto", s: "en clásico son dos" },
    { t: "Con su propio tiempo" },
    { t: "La advertencia" },
    { t: "Permiso del árbitro" },
    { t: "No: ya es espectador", tono: "no" },
    { t: "Desde la última posición identificable" } ] },
  // 36
  { tipo: "filas", k: "Preguntas 10 y 11", items: [
    { ic: "🚫", t: "10. Multa, exclusión o expulsión", s: "multa anunciada de antemano; una o más rondas o la competición" },
    { ic: "✋", t: "11. No puede reclamar", s: "al tocar con esa intención, pierde ese derecho", tono: "no" } ] },
  // 37
  { tipo: "tarjetas", k: "Para la próxima sesión", items: [
    { ic: "📝", t: "Tarea", s: "analiza un reclamo, real o hipotético: la norma y la decisión justificada" },
    { ic: "❓", t: "¿Dudas?", s: "este es el momento" },
    { ic: "🙏", t: "Gracias", s: "por tu participación" } ] },
];
