/* Lo que se VE en cada lámina de la Clase 4 de Formación Ajedrez (el reloj).
 *
 * Una entrada por lámina, en el mismo orden que
 * cursos/recursos/formacion-ajedrez/presentaciones/clase-04/diapositivas.json.
 * El título grande de cada lámina NO está acá: sale del `titulo` de ese
 * archivo. Esta clase no trae posiciones, así que no hay tableros.
 *
 * Una lámina dice poco a propósito (ver «Las láminas dicen poco» en
 * docs/decisiones/clase-en-vivo.md): la transcripción completa sigue en el
 * `texto` del JSON. verificar-formacion-laminas.js cuenta las palabras.
 *
 * Tonos de una marca: "si" (verde), "no" (rojo), "ojo" (ámbar), "info" (azul). El color
 * nunca va solo: la marca lleva siempre su palabra escrita.
 */
module.exports = [
  // 1
  { tipo: "portada", k: "Formación de Personas Árbitras y Asesoras · JDE",
    t: "Sesión 4", s: "Uso, configuración y control del reloj de ajedrez" },
  // 2
  { tipo: "filas", k: "Al terminar la sesión podrás…", items: [
    { ic: "⏱️", t: "Aplicar las reglas del reloj", s: "durante la partida", a: "6" },
    { ic: "🔀", t: "Distinguir los controles", s: "sin incremento, Fischer, demora y por períodos" },
    { ic: "⚙️", t: "Configurar el reloj", s: "clásicas, rápidas y relámpago" },
    { ic: "🚩", t: "Resolver incidencias de tiempo", s: "bandera, incomparecencia y reloj defectuoso" } ] },
  // 3
  { tipo: "crono", k: "4 horas · 240 minutos", items: [
    ["0:00", "Repaso y tarea"],
    ["0:10", "El reloj en las Leyes"],
    ["0:45", "Sistemas de control de tiempo"],
    ["1:20", "Receso", true],
    ["1:30", "Configurar según la modalidad"],
    ["2:05", "Incidencias de tiempo"],
    ["2:30", "Receso", true],
    ["2:40", "Práctica por escenario"],
    ["3:15", "Quiz de la sesión"],
    ["3:45", "Cierre"] ] },
  // 4
  { tipo: "filas", k: "Art. 6", cols: 2, items: [
    { ic: "pieza:wK", t: "A la hora, arranca el reloj de las blancas", s: "esté o no en la mesa" },
    { ic: "✋", t: "Mueve y presiona con la misma mano" },
    { ic: "🚫", t: "Sin dedo en el botón ni golpes" },
    { ic: "🔧", t: "Acomoda piezas solo con su reloj en marcha" } ],
    clave: "Hecha al soltar la pieza; completada al presionar el reloj." },
  // 5
  { tipo: "tarjetas", k: "Quien arbitra sabe configurarlos y explicarlos", cols: 2, items: [
    { ic: "🔒", t: "Sin incremento", s: "un tiempo fijo para toda la partida" },
    { ic: "➕", t: "Incremento (Fischer)", s: "se suma tras cada jugada, desde la primera" },
    { ic: "⏳", t: "Demora", s: "el principal baja al agotarse el de la jugada" },
    { ic: "🗓️", t: "Por períodos", s: "40 jugadas en 90 min, luego 30 más" } ] },
  // 6
  { tipo: "receso" },
  // 7
  { tipo: "filas", k: "Antes de la ronda, todos los relojes", numerar: true, items: [
    { ic: "📜", t: "El ritmo del reglamento del torneo" },
    { ic: "🔍", t: "Tiempo base, incremento y período siguiente" },
    { ic: "⚖️", t: "El mismo tiempo en los dos lados" },
    { ic: "🧰", t: "Relojes de repuesto configurados" } ],
    clave: "Mal configurado a mitad de partida: el árbitro lo corrige o lo reemplaza." },
  // 8
  { tipo: "tabla", k: "Cuando se agota el tiempo", cab: ["Situación", "Resultado", "¿Qué pasa?"], filas: [
    ["Cae la bandera", "", "Pierde", "no", "si el rival puede dar mate"],
    ["El rival no puede dar mate", "", "Tablas", "ojo", "con ninguna serie de jugadas legales"],
    ["Clásico con árbitro", "", "De oficio", "", "la declara el árbitro"],
    ["Relámpago sin supervisión", "", "Reclamo", "", "la reclama el jugador"],
    ["Sin tiempo de incomparecencia", "", "Es cero", "", "pierde quien llega tarde, salvo otra decisión"] ] },
  // 9
  { tipo: "frase", k: "Caso 1 · Las blancas no llegaron", ic: "🪑",
    t: "Es la hora de inicio y el jugador de blancas no está en la mesa.",
    s: "El reglamento fija 15 minutos de incomparecencia." },
  // 10
  { tipo: "frase", k: "Caso 1 · Las blancas no llegaron", ic: "⏱️",
    t: "Se pone en marcha el reloj de las blancas igual.",
    s: "Si llega antes de los 15 minutos, juega con lo que le quede; si no, pierde." },
  // 11
  { tipo: "frase", k: "Caso 2 · Presionar antes de mover", ic: "✋",
    t: "En apuro de tiempo, presiona el reloj antes de soltar la pieza." },
  // 12
  { tipo: "frase", k: "Caso 2 · Presionar antes de mover", ic: "🟨",
    t: "Manejo indebido del reloj: el árbitro interviene.",
    s: "Aplica una sanción, de menor a mayor.", a: "12.9" },
  // 13
  { tipo: "frase", k: "Caso 3 · Bandera con rey y caballo", ic: "🚩",
    t: "Cae la bandera de las blancas.",
    s: "Negras: rey y caballo. Blancas: rey y peón." },
  // 14
  { tipo: "frase", k: "Caso 3 · Bandera con rey y caballo", ic: "pieza:bN", tono: "no",
    t: "Pierden las blancas: hay una serie de jugadas que termina en mate.",
    s: "Por ejemplo: rey blanco en h1 y peón en h2; rey negro en f1 y caballo en f2.",
    clave: "Tablas solo si no hay mate de ninguna manera." },
  // 15
  { tipo: "frase", k: "Caso 4 · Reloj con defecto evidente", ic: "⚠️",
    t: "A mitad de partida, la pantalla de un reloj deja de funcionar." },
  // 16
  { tipo: "frase", k: "Caso 4 · Reloj con defecto evidente", ic: "🔄",
    t: "El árbitro lo reemplaza y fija los tiempos con su criterio.",
    s: "Se apoya en las planillas y en lo que recuerden los jugadores." },
  // 17
  { tipo: "receso" },
  // 18
  { tipo: "tarjetas", k: "Con un simulador de reloj digital en línea", items: [
    { ic: "♟️", t: "Clásica" },
    { ic: "⏩", t: "Rápida" },
    { ic: "⚡", t: "Relámpago" } ],
    clave: "Cada participante configura los tres escenarios." },
  // 19
  { tipo: "frase", k: "Configura el reloj", ic: "♟️",
    t: "Clásica: 90 minutos + 30 segundos desde la jugada 1.",
    s: "¿Deben anotar los jugadores toda la partida?" },
  // 20
  { tipo: "frase", k: "Configura el reloj", ic: "⏩",
    t: "Rápidas: 15 minutos + 10 segundos.",
    s: "¿Qué ritmo es según la fórmula?" },
  // 21
  { tipo: "frase", k: "Configura el reloj", ic: "⚡",
    t: "Relámpago: 3 minutos + 2 segundos.",
    s: "¿Qué ritmo es?" },
  // 22
  { tipo: "frase", k: "¿Resultado?", ic: "🚩",
    t: "Cae la bandera de un jugador.",
    s: "Su rival solo tiene el rey." },
  // 23
  { tipo: "frase", k: "¿Qué pasa?", ic: "⏰",
    t: "Un jugador llega 3 minutos tarde.",
    s: "El reglamento no dice nada sobre la tolerancia." },
  // 24
  { tipo: "tabla", k: "Cada respuesta, con su artículo", cab: ["Ejercicio", "Respuesta", "Por qué"], filas: [
    ["1 · 90 min + 30 s", "8.4", "Sí, anotan", "si", "con 30 s o más no se deja de anotar"],
    ["2 · 15 min + 10 s", "", "Rápidas", "", "15 + 10 = 25 minutos"],
    ["3 · 3 min + 2 s", "", "Relámpago", "", "3 + 2 = 5 minutos"],
    ["4 · Rival con rey solo", "6.9", "Tablas", "ojo", "no puede dar mate de ninguna forma"],
    ["5 · 3 minutos tarde", "6.7", "Pierde", "no", "salvo que el árbitro decida otra cosa"] ] },
  // 25
  { tipo: "tarjetas", k: "Un minuto por pregunta", cols: 4, compacto: true, numerar: true, items: [
    { t: "¿Qué es el «tiempo Fischer»?" },
    { t: "Se agota el tiempo: ¿qué se verifica primero?" },
    { t: "¿Qué reloj arranca al empezar?" },
    { t: "¿Con qué mano se presiona?" },
    { t: "Demora: ¿cuándo baja el tiempo principal?" },
    { t: "Sin tiempo de incomparecencia fijado: ¿cuál es?" },
    { t: "¿Acomoda piezas con el reloj rival en marcha?" } ] },
  // 26
  { tipo: "filas", k: "Un minuto por pregunta", items: [
    { ic: "✍️", t: "8 · Menos de 5 min, sin incremento de 30 s: ¿sigue anotando?" },
    { ic: "🚩", t: "9 · Clásico con árbitro: ¿quién declara la bandera?" },
    { ic: "🔧", t: "10 · Reloj mal configurado a mitad de partida: ¿qué hace el árbitro?" },
    { ic: "✋", t: "11 · ¿Cuándo queda hecha una jugada y cuándo completada?" } ] },
  // 27
  { tipo: "tarjetas", cols: 5, compacto: true, numerar: true, items: [
    { t: "Tiempo extra tras cada jugada" },
    { t: "Si el rival puede dar mate" },
    { t: "El de las blancas", s: "esté o no en la mesa" },
    { t: "La misma con que movió" },
    { t: "Al agotarse el tiempo fijo" },
    { t: "Cero" },
    { t: "No", s: "solo con su reloj en marcha" },
    { t: "No", s: "puede dejar de anotar" },
    { t: "El árbitro", s: "de oficio" },
    { t: "Lo corrige o reemplaza", s: "y fija los tiempos" } ] },
  // 28
  { tipo: "tarjetas", k: "11 · ¿Cuándo queda hecha y cuándo completada?", items: [
    { ic: "✋", t: "Hecha", s: "al soltar la pieza" },
    { ic: "⏱️", t: "Completada", s: "al presionar el reloj" } ] },
  // 29
  { tipo: "tarjetas", k: "Para la próxima sesión", items: [
    { ic: "📚", t: "Tarea", s: "una ficha con tiempo base e incremento para tres modalidades, según la normativa JDE" },
    { ic: "💬", t: "¿Dudas?", s: "este es el momento" },
    { ic: "🙌", t: "Gracias", s: "por tu participación" } ] },
];
