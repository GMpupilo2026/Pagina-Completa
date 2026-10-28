/* Lo que se VE en cada lámina de la Clase 3 de Formación Ajedrez: apéndices
 * de las Leyes (rápidas y relámpago), desempates, la Normativa JDE 2026 y los
 * sistemas de emparejamiento.
 *
 * Una entrada por lámina, en el mismo orden que
 * cursos/recursos/formacion-ajedrez/presentaciones/clase-03/diapositivas.json.
 * El título grande sale del `titulo` de ese archivo; esta clase no tiene
 * posiciones de ajedrez. Lo que el profe explica en voz sigue completo en el
 * `texto` del JSON (ver «Las láminas dicen poco» en
 * docs/decisiones/clase-en-vivo.md).
 *
 * Tonos de una marca: "si" (verde), "no" (rojo), "ojo" (ámbar), "info" (azul). El color
 * nunca va solo: la marca lleva siempre su palabra escrita.
 */
module.exports = [
  // 1
  { tipo: "portada", k: "Formación de Personas Árbitras y Asesoras · JDE",
    t: "Sesión 3", s: "Apéndices, normativa JDE y sistemas de emparejamiento" },
  // 2
  { tipo: "filas", k: "Al terminar la sesión podrás…", cols: 2, items: [
    { ic: "⏱️", t: "Clasificar un ritmo", s: "fórmula de 60 jugadas" },
    { ic: "⚡", t: "Aplicar rápidas y relámpago", s: "con y sin supervisión" },
    { ic: "🧮", t: "Calcular desempates", s: "Buchholz, Sonneborn-Berger y más" },
    { ic: "📜", t: "Aplicar el artículo 66", s: "de la Normativa JDE 2026" },
    { ic: "🔀", t: "Usar las reglas del suizo", s: "rivales, colores y descansos" },
    { ic: "📋", t: "Emparejar la primera ronda", s: "desde la lista inicial" },
    { ic: "📊", t: "Emparejar las siguientes", s: "por grupos de puntuación" } ] },
  // 3
  { tipo: "tarjetas", k: "Y además…", items: [
    { ic: "🔄", t: "Calendarizar un todos contra todos", s: "con las tablas de Berger" },
    { ic: "⚖️", t: "Elegir el sistema adecuado", s: "según participantes, tiempo y objetivo" } ] },
  // 4
  { tipo: "crono", k: "4 horas · 240 minutos", items: [
    ["0:00", "Repaso y tarea"],
    ["0:15", "Ritmos: apéndices A y B"],
    ["0:45", "Sistemas de desempate"],
    ["1:25", "Receso", true],
    ["1:35", "Normativa JDE 2026"],
    ["1:55", "El sistema suizo"],
    ["2:30", "Todos contra todos"],
    ["2:50", "Receso", true],
    ["3:00", "Práctica integradora"],
    ["3:30", "Quiz de la sesión"],
    ["3:50", "Cierre"] ] },
  // 5
  { tipo: "tarjetas", k: "Tiempo base + 60 × incremento", cols: 3, compacto: true, items: [
    { ic: "⚡", t: "Relámpago", s: "10 min o menos" },
    { ic: "🐇", t: "Rápidas", s: "más de 10 y menos de 60" },
    { ic: "🐢", t: "Clásico", s: "60 min o más" },
    { t: "3 + 2 s → 5 min" },
    { t: "15 + 10 s → 25 min" },
    { t: "90 + 30 s → 120 min" } ],
    clave: "Se supone una partida de 60 jugadas." },
  // 6
  { tipo: "dos", k: "Anotar no es obligatorio · sanciones de 1 minuto, no 2",
    izq: { t: "Con supervisión", items: [
      ["Un árbitro por cada 3 partidas", "A.4"],
      ["Registra cada partida", "A.4"],
      ["Rigen las reglas de competición", ""] ] },
    der: { t: "Sin supervisión", items: [
      ["Tras 10 jugadas: ni reloj ni tablero", "A.5.1"],
      ["Ilegal: solo si el rival no jugó", "A.5.2"],
      ["Bandera: sin mate posible, tablas", "A.5.3"] ] } },
  // 7
  { tipo: "frase", k: "Rápidas y relámpago", ic: "🏁",
    t: "El mate termina la partida al instante",
    s: "Si da mate y un instante después cae su bandera, gana quien dio mate." },
  // 8
  { tipo: "tarjetas", k: "Lo más usado en el sistema suizo", cols: 2, compacto: true, items: [
    { ic: "➕", t: "Buchholz", s: "suma los puntos de todos sus rivales" },
    { ic: "✂️", t: "Con corte 1", s: "quita el resultado más bajo" },
    { ic: "👩", t: "Ana: 12½", s: "corte 1 (sin el 1): 11½" },
    { ic: "👨", t: "Bruno: 12½", s: "corte 1 (sin un 2): 10½" } ],
    clave: "Empatan en Buchholz; el corte 1 pone primero a Ana." },
  // 9
  { tipo: "filas", k: "Si no se resuelve, se pasa al siguiente", items: [
    { ic: "🏆", t: "Sonneborn-Berger", s: "puntos de los vencidos + mitad de los empatados" },
    { ic: "🤝", t: "Encuentro directo", s: "las partidas entre los empatados" },
    { ic: "⏭️", t: "No se enfrentaron o no define", s: "siguiente desempate de la lista" },
    { ic: "🎲", t: "Se agota la lista", s: "sorteo, salvo que el reglamento diga otra cosa" } ] },
  // 10
  { tipo: "tabla", k: "Sistema holandés · 7 jugadores: uno queda libre cada ronda",
    cab: ["Ronda", "Libre", "Partidas"], filas: [
    ["Ronda 1", "", "Camila", "", "Sofía 1–0 Gabriel · Lucía ½–½ Mateo · Valeria 0–1 Andrés"],
    ["Ronda 2", "", "Gabriel", "", "Camila ½–½ Sofía · Andrés ½–½ Lucía · Mateo 1–0 Valeria"],
    ["Ronda 3", "", "Valeria", "", "Sofía 1–0 Andrés · Mateo ½–½ Camila · Gabriel ½–½ Lucía"],
    ["Ronda 4", "", "Andrés", "", "Sofía 0–1 Mateo · Camila 1–0 Gabriel · Lucía 1–0 Valeria"],
    ["Final", "", "Mateo 3 · Camila 3", "ojo", "Sofía, Lucía y Andrés 2½ · Gabriel 1½ · Valeria 1"] ] },
  // 11
  { tipo: "dos", k: "Buchholz: se suman los puntos finales de los rivales",
    izq: { t: "Mateo · Buchholz 9", items: [
      ["Lucía 2½", ""], ["Valeria 1 · se corta", "", "no"], ["Camila 3", ""], ["Sofía 2½", ""] ] },
    der: { t: "Camila · Buchholz 9", items: [
      ["Libre: cuenta 2, no 3", "C.07, 16", "ojo"], ["Sofía 2½", ""], ["Mateo 3", ""], ["Gabriel 1½ · se corta", "", "no"] ] },
    clave: "Con corte 1: Mateo 8 y Camila 7½. Primero, Mateo." },
  // 12
  { tipo: "frase", k: "Error común", ic: "⚠️", t: "La ronda libre cuenta como un rival con tus mismos puntos, con tope",
    s: "Nunca más de la mitad de las rondas. Como 0, Camila tendría 7; con sus 3 puntos, 10. Lo correcto: 9.", a: "C.07, art. 16" },
  // 13
  { tipo: "tabla", k: "Todos contra todos · tres empatados en 3½",
    cab: ["Jugador", "Puntos", "Resultados"], filas: [
    ["Irene", "", "3½", "", "gana a Julián, Marta y Noelia · ½ con Luis · pierde con Karla"],
    ["Julián", "", "3½", "", "gana a Karla, Luis y Marta · ½ con Noelia · pierde con Irene"],
    ["Karla", "", "3½", "", "gana a Irene, Luis y Noelia · ½ con Marta · pierde con Julián"],
    ["Luis · Marta · Noelia", "", "2 · 1½ · 1", "", ""] ] },
  // 14
  { tipo: "filas", k: "Encuentro directo: 1 punto cada uno, no separa", items: [
    { ic: "🥇", t: "Julián: 7½", s: "Karla 3½ + Luis 2 + Marta 1½ + ½ de Noelia" },
    { ic: "🥈", t: "Karla: 7¼", s: "Irene 3½ + Luis 2 + Noelia 1 + ½ de Marta" },
    { ic: "🥉", t: "Irene: 7", s: "Julián 3½ + Marta 1½ + Noelia 1 + ½ de Luis" } ],
    clave: "Sonneborn-Berger: los vencidos enteros, los empates a la mitad." },
  // 15
  { tipo: "receso" },
  // 16
  { tipo: "filas", k: "Categorías A a E · si no lo dice: FCA, luego FIDE", cols: 2, items: [
    { ic: "👤", t: "Individual o equipos", s: "solo una por estudiante", a: "66.1.e y h" },
    { ic: "👥", t: "Equipos de 3 a 5", s: "cuatro titulares y un suplente", a: "66.1.g" },
    { ic: "🪑", t: "Al menos 2 al tablero", a: "66.2.f" },
    { ic: "✍️", t: "Anotación algebraica", s: "amonestación a pedido del rival (no en cat. A)", a: "66.2.g" },
    { ic: "🔢", t: "Puntos: 1, ½ y 0", a: "66.3" },
    { ic: "🧑‍⚖️", t: "Tres desempates o más", s: "en el congresillo", a: "66.4" } ] },
  // 17
  { tipo: "frase", k: "Presentación", ic: "⏰",
    t: "Puede llegar hasta que su reloj caiga a cero", a: "art. 30" },
  // 18
  { tipo: "tabla", k: "Lo que fija la Normativa", cab: ["Etapa", "Sistema", "Ritmo mínimo"], filas: [
    ["Regional", "66.2.a y b", "Suizo, 5+ rondas (más de 8) · todos contra todos (8 o menos)", "", "10 min + 2 s (rápidas)"],
    ["Interregional", "66.2.c", "Todos contra todos", "", "10 min + 2 s"],
    ["Nacional", "66.2.d y e", "Suizo, 5 rondas (más de 7) · todos contra todos (6 o menos)", "", "Clásico; blitz 3 + 2"],
    ["Nacional con 7 exactos", "", "No lo dice", "ojo", "Dejarlo en el acta"] ] },
  // 19
  { tipo: "frase", k: "Regional e Interregional", ic: "⏱️",
    t: "Primera jugada ilegal: +1 minuto al rival, no 2", a: "A.3" },
  // 20
  { tipo: "tarjetas", k: "Ronda a ronda, con puntuaciones iguales o parecidas", cols: 2, compacto: true, items: [
    { ic: "🚫", t: "Nunca el mismo rival dos veces", s: "la regla absoluta" },
    { ic: "⚖️", t: "Blancas menos negras", s: "entre −2 y 2" },
    { ic: "🎨", t: "No tres veces seguidas el mismo color", s: "salvo en la última ronda" },
    { ic: "☕", t: "Impar: uno queda libre (bye)", s: "1 punto sin color, una sola vez" } ],
    clave: "Las rondas se anuncian antes de empezar." },
  // 21
  { tipo: "filas", k: "Sistema suizo", numerar: true, items: [
    { ic: "📋", t: "Ordenar por rating", s: "sin rating: alfabético o sorteo anunciado" },
    { ic: "✂️", t: "Dos mitades", s: "la superior contra la inferior" },
    { ic: "🎲", t: "Sortear el color del 1", s: "y alternarlo tablero a tablero" } ],
    clave: "Con 12: 1–7, 8–2, 3–9, 10–4, 5–11, 12–6 (blancas el primero)." },
  // 22
  { tipo: "filas", k: "Desde la ronda 2", cols: 2, items: [
    { ic: "📊", t: "Grupos de puntuación", s: "mitad superior contra inferior" },
    { ic: "⬇️", t: "Sin pareja en su grupo", s: "baja al siguiente como flotante" },
    { ic: "📌", t: "Publicado, no se cambia", s: "salvo que repita un par" },
    { ic: "0️⃣", t: "Sabe que no jugará", s: "no se empareja y anota cero" },
    { ic: "🚪", t: "Falta sin avisar", s: "se considera retirado" },
    { ic: "🚫", t: "Prohibido favorecer", s: "a nadie con el emparejamiento" } ] },
  // 23
  { tipo: "frase", k: "En la práctica", ic: "💻",
    t: "Se usa un programa reconocido por la FIDE",
    s: "Quien arbitra debe entender lo que hace para poder revisarlo." },
  // 24
  { tipo: "dos", k: "Cada jugador, una vez contra todos los demás",
    izq: { t: "Con n jugadores", items: [
      ["n par: n − 1 rondas", ""],
      ["n × (n − 1) / 2 partidas", ""],
      ["6: 5 rondas y 15 partidas", ""],
      ["8: 7 rondas y 28 partidas", ""],
      ["Impar: se agrega un descanso", ""] ] },
    der: { t: "Berger con 4", items: [
      ["Ronda 1: 1–4, 2–3", ""],
      ["Ronda 2: 4–3, 1–2", ""],
      ["Ronda 3: 2–4, 3–1", ""] ] },
    clave: "Desempate: Sonneborn-Berger. El Buchholz no distingue." },
  // 25
  { tipo: "dos", k: "Depende de cuántos, del tiempo y del objetivo",
    izq: { t: "Todos contra todos", items: [
      ["Hasta 8 o 10 participantes", ""],
      ["Tiempo suficiente", ""],
      ["La clasificación más justa", ""] ] },
    der: { t: "Suizo", items: [
      ["Muchos participantes", ""],
      ["Pocas rondas posibles", ""],
      ["Rondas: dividir n entre 2 hasta 1, y sumar 1 o 2", ""] ] },
    clave: "Si clasifica a otra etapa, las bases dicen cuántos y cómo." },
  // 26
  { tipo: "frase", k: "En la JDE lo decide la Normativa", ic: "📜",
    t: "Regional: suizo de 5 rondas o más con más de 8; todos contra todos con 8 o menos",
    a: "66.2.a y 66.2.b" },
  // 27
  { tipo: "frase", k: "Caso 1 · ¿Rápidas o relámpago?", ic: "⏱️",
    t: "Un torneo escolar se anuncia a 5 min + 3 s por jugada." },
  // 28
  { tipo: "frase", k: "Caso 1 · ¿Rápidas o relámpago?", ic: "⚡",
    t: "Relámpago", s: "5 + 60 × 3 s = 8 minutos: no pasa de 10." },
  // 29
  { tipo: "frase", k: "Caso 2 · Justo en el límite", ic: "⚖️",
    t: "Un torneo se anuncia a 45 min + 15 s." },
  // 30
  { tipo: "frase", k: "Caso 2 · Justo en el límite", ic: "🐢",
    t: "Ya es clásico", s: "45 + 15 = 60 minutos, y las rápidas son de menos de 60." },
  // 31
  { tipo: "frase", k: "Caso 3 · Mate y bandera", ic: "🚩",
    t: "En relámpago, un estudiante da mate y, un instante después, cae su bandera." },
  // 32
  { tipo: "frase", k: "Caso 3 · Mate y bandera", ic: "🏁", tono: "si",
    t: "Gana quien dio mate", s: "El mate termina la partida en el momento en que se produce." },
  // 33
  { tipo: "frase", k: "Caso 4 · Llega con el reloj corriendo", ic: "🏃",
    t: "Llega 8 minutos tarde y su rival ya puso en marcha el reloj.",
    s: "Etapa Regional a 10 min + 2 s." },
  // 34
  { tipo: "frase", k: "Caso 4 · Llega con el reloj corriendo", ic: "⏰", tono: "si",
    t: "Puede jugar, con el tiempo que le queda",
    s: "Se admite hasta que su reloj caiga a cero. Si ya llegó a cero: no presentación (art. 32).",
    a: "art. 30" },
  // 35
  { tipo: "frase", k: "Caso 5 · Categoría A sin planilla", ic: "✍️",
    t: "Un niño de la categoría A no anota, y su rival pide que lo amonesten." },
  // 36
  { tipo: "frase", k: "Caso 5 · Categoría A sin planilla", ic: "🙅", tono: "no",
    t: "No se amonesta en la categoría A",
    s: "En las demás, la persona árbitra principal amonesta si el rival lo pide.", a: "66.2.g" },
  // 37
  { tipo: "frase", k: "Caso 6 · La primera ilegal en la Regional", ic: "pieza:wK",
    t: "Deja su rey en jaque y presiona el reloj; el rival aún no juega.",
    s: "Etapa Regional a 10 min + 2 s. Es su primera jugada ilegal." },
  // 38
  { tipo: "frase", k: "Caso 6 · La primera ilegal en la Regional", ic: "↩️",
    t: "Se vuelve a la posición anterior y el rival recibe 1 minuto",
    s: "10 + 60 × 2 s = 12 min: es rápida. Juega otra, respetando la pieza tocada.",
    a: "A.1 y A.3" },
  // 39
  { tipo: "frase", k: "Caso 7 · La ronda 2 de un suizo de 8", ic: "🔀",
    t: "Ronda 1: 1–5, 6–2, 3–7, 8–4",
    s: "El primero lleva blancas. Ganan 1, 2, 7 y 8. ¿Cómo queda la ronda 2?" },
  // 40
  { tipo: "filas", k: "Caso 7 · La ronda 2 de un suizo de 8", items: [
    { ic: "1️⃣", t: "Grupo de 1 punto: 1, 2, 7 y 8", s: "1 contra 7 y 2 contra 8" },
    { ic: "0️⃣", t: "Grupo de 0: 3, 4, 5 y 6", s: "3 contra 5 y 4 contra 6" },
    { ic: "🎨", t: "Blancas a quien tuvo negras", s: "7, 2, 5 y 4" } ],
    clave: "Ronda 2: 7–1, 2–8, 5–3, 4–6." },
  // 41
  { tipo: "frase", k: "Caso 8 · El emparejamiento publicado", ic: "📌",
    t: "Tras publicar la ronda 4, un padre pide cambiar un emparejamiento.",
    s: "Su hijo «ya jugó con alguien de su colegio»." },
  // 42
  { tipo: "frase", k: "Caso 8 · El emparejamiento publicado", ic: "🚫", tono: "no",
    t: "No se cambia",
    s: "El mismo centro educativo no es causa. Solo se corrige si repite un par, salvo que el evento anuncie evitar esos cruces." },
  // 43
  { tipo: "frase", k: "Caso 9 · Siete en round robin", ic: "👥",
    t: "Se inscriben 7 estudiantes y se quiere un todos contra todos." },
  // 44
  { tipo: "frase", k: "Caso 9 · Siete en round robin", ic: "☕",
    t: "Se agrega un descanso como octavo número",
    s: "7 rondas y 21 partidas; en cada ronda descansa uno." },
  // 45
  { tipo: "receso" },
  // 46
  { tipo: "tarjetas", k: "Práctica integradora", numerar: true, items: [
    { ic: "🧮", t: "Desempates", s: "torneo de 8: tabla final con Buchholz y Sonneborn-Berger" },
    { ic: "🔀", t: "Cuadro de emparejamiento", s: "12 jugadores: primera ronda suiza y su round robin" } ] },
  // 47
  { tipo: "tarjetas", k: "Clasifica estos ritmos", cols: 2, compacto: true, items: [
    { ic: "⏱️", t: "a) 10 min", s: "sin incremento" },
    { ic: "⏱️", t: "b) 10 min + 5 s" },
    { ic: "⏱️", t: "c) 25 min + 10 s" },
    { ic: "⏱️", t: "d) 60 min", s: "sin incremento" } ] },
  // 48
  { tipo: "tabla", k: "Todos contra todos · ¿quién queda primero por Sonneborn-Berger?",
    cab: ["Jugador", "Puntos", "Resultados"], filas: [
    ["A", "", "3½", "", "½ con B · gana a C, D y F · pierde con E"],
    ["B", "", "3½", "", "½ con A · gana a D, E y F · pierde con C"],
    ["C", "", "3", "", ""],
    ["D", "", "2½", "", ""],
    ["E", "", "1½", "", ""],
    ["F", "", "1", "", ""] ] },
  // 49
  { tipo: "tarjetas", k: "Suizo a 5 rondas · los dos con 4 puntos", items: [
    { ic: "👩", t: "Carla", s: "rivales: 4, 3, 3, 2 y ½" },
    { ic: "👨", t: "Diego", s: "rivales: 3½, 3, 3, 2½ y 1" } ],
    clave: "Calcula Buchholz y Buchholz con corte 1." },
  // 50
  { tipo: "filas", k: "Completa con la Normativa JDE 2026", numerar: true, items: [
    { ic: "🔀", t: "Sistema y ritmo", s: "Etapa Regional con 12 inscritos por modalidad" },
    { ic: "🪑", t: "Mínimo al tablero", s: "al iniciar una ronda por equipos" },
    { ic: "🧑‍⚖️", t: "Quién fija los desempates" },
    { ic: "⏰", t: "Hasta cuándo puede presentarse" } ] },
  // 51
  { tipo: "frase", k: "Etapa Nacional · individual abierto", ic: "7️⃣",
    t: "Siete inscritos",
    s: "¿Qué sistema dice la Normativa? ¿Qué debe hacer la persona árbitra principal?" },
  // 52
  { tipo: "frase", k: "Suizo con 12 jugadores", ic: "📋",
    t: "Escribe la primera ronda",
    s: "Ordenados por rating del 1 al 12; el 1 lleva blancas por sorteo." },
  // 53
  { tipo: "tarjetas", k: "Todos contra todos", items: [
    { ic: "🔟", t: "10 jugadores", s: "¿cuántas rondas y cuántas partidas?" },
    { ic: "9️⃣", t: "9 jugadores", s: "¿cuántas rondas y cuántas partidas?" } ] },
  // 54
  { tipo: "frase", k: "Tabla de Berger", ic: "🔄",
    t: "Escribe el calendario completo de un todos contra todos de 4 jugadores." },
  // 55
  { tipo: "frase", k: "Sistema suizo", ic: "☕",
    t: "Un suizo tiene 11 jugadores",
    s: "¿Qué pasa en cada ronda con el número impar?" },
  // 56
  { tipo: "filas", k: "Ejercicios 1 a 4", numerar: true, items: [
    { t: "Relámpago, rápidas, rápidas, clásico", s: "10 · 15 · 35 · 60 minutos" },
    { t: "Primero A: 8¼ contra 6¾", s: "el encuentro directo no los separaba" },
    { t: "Buchholz: Diego 13, Carla 12½", s: "con corte 1, 12 y 12: siguiente criterio" },
    { t: "Suizo de 5+ rondas a 10 min + 2 s", s: "2 al tablero · desempates: el principal · hasta reloj en cero" } ] },
  // 57
  { tipo: "filas", k: "Ejercicios 5 a 9", items: [
    { ic: "5️⃣", t: "Siete no está previsto", s: "se acuerda en el congresillo y va al acta", a: "art. 34" },
    { ic: "6️⃣", t: "1–7, 8–2, 3–9, 10–4, 5–11, 12–6" },
    { ic: "7️⃣", t: "10: 9 rondas y 45 partidas", s: "9: con descanso, 9 rondas y 36 partidas" },
    { ic: "8️⃣", t: "1–4, 2–3 · 4–3, 1–2 · 2–4, 3–1" },
    { ic: "9️⃣", t: "Uno libre: 1 punto sin color", s: "nunca a quien ya lo tuvo o ganó por incomparecencia" } ] },
  // 58
  { tipo: "filas", k: "Preguntas 1 a 7", cols: 2, items: [
    { t: "1. ¿Qué desempate suma los puntos de los rivales?" },
    { t: "2. ¿Qué distingue al relámpago del rápido?" },
    { t: "3. ¿Cómo se clasifica un ritmo con incremento?" },
    { t: "4. ¿Dónde es habitual el Sonneborn-Berger?" },
    { t: "5. Se agotó la lista de desempates: ¿qué corresponde?" },
    { t: "6. En rápidas, ¿es obligatorio anotar?" },
    { t: "7. Relámpago sin supervisión: ¿quién reclama la bandera?" } ] },
  // 59
  { tipo: "filas", k: "Preguntas 8 a 12", items: [
    { t: "8. Sin supervisión, tras 10 jugadas: ¿se reclama un tablero mal orientado?" },
    { t: "9. Si la Normativa no lo regula, ¿qué se aplica?" },
    { t: "10. Empatados que no se enfrentaron: ¿qué corresponde?" },
    { t: "11. Da mate y al instante cae su bandera: ¿quién gana?" },
    { t: "12. Regional a 10 min + 2 s: ¿qué es para la FIDE?" } ] },
  // 60
  { tipo: "filas", k: "Preguntas 13 a 19", cols: 2, items: [
    { t: "13. ¿Cuántos de un equipo, al tablero al iniciar?" },
    { t: "14. Muchos participantes y poco tiempo: ¿qué sistema?" },
    { t: "15. ¿Qué define al todos contra todos?" },
    { t: "16. ¿Cómo se ordena la lista inicial?" },
    { t: "17. ¿Cuándo se cambia un emparejamiento publicado?" },
    { t: "18. ¿Qué recibe quien queda libre?" },
    { t: "19. ¿Cuántas partidas, todos contra todos con 8?" } ] },
  // 61
  { tipo: "filas", k: "Preguntas 20 a 24", items: [
    { ic: "⚖️", t: "20. ¿Puede la diferencia de colores llegar a 3?" },
    { ic: "🎨", t: "21. ¿Puede recibir el mismo color tres veces seguidas?" },
    { ic: "🚪", t: "22. Falta sin avisar: ¿qué se asume?" },
    { ic: "🏆", t: "23. Todos contra todos: ¿por qué Sonneborn-Berger y no Buchholz?" },
    { ic: "🚫", t: "24. ¿Se puede cambiar un emparejamiento para favorecer a alguien?" } ] },
  // 62
  { tipo: "tarjetas", k: "Respuestas 1 a 8", cols: 4, compacto: true, numerar: true, items: [
    { t: "Buchholz" },
    { t: "El control de tiempo" },
    { t: "Base + 60 × incremento" },
    { t: "Todos contra todos" },
    { t: "Sorteo", s: "salvo otra regla del reglamento" },
    { t: "No", s: "salvo que el reglamento lo exija" },
    { t: "El propio jugador", s: "sin mate posible: tablas", a: "A.5.3" },
    { t: "No", s: "ya no se admite" } ] },
  // 63
  { tipo: "tarjetas", k: "Respuestas 9 a 17", cols: 3, compacto: true, items: [
    { t: "9. FCA y luego FIDE", a: "art. 66" },
    { t: "10. El siguiente desempate" },
    { t: "11. Gana quien dio mate" },
    { t: "12. Rápida: 12 min", a: "A.1" },
    { t: "13. Al menos dos", a: "66.2.f" },
    { t: "14. Suizo" },
    { t: "15. Todos juegan con todos" },
    { t: "16. Por rating, de mayor a menor" },
    { t: "17. Si repite un par" } ] },
  // 64
  { tipo: "dos", k: "Respuestas 18 a 24",
    izq: { t: "Suizo", items: [
      ["18. Un punto, sin color", ""],
      ["20. No: entre −2 y 2", ""],
      ["21. No, salvo en la última ronda", ""],
      ["22. Retirado, salvo que explique antes", ""],
      ["24. No: está prohibido", ""] ] },
    der: { t: "Todos contra todos", items: [
      ["19. 28 partidas, en 7 rondas", ""],
      ["23. Todos tienen los mismos rivales: el Buchholz no distingue", ""] ] } },
  // 65
  { tipo: "tarjetas", k: "Próxima sesión", items: [
    { ic: "📚", t: "Tarea", s: "un caso de inscripción o categoría JDE y la ronda 2 de un suizo simulado" },
    { ic: "👋", t: "¿Dudas?", s: "Este es el momento. ¡Gracias por participar!" } ] },
];
