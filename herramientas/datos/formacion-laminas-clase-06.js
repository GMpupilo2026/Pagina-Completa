/* Lo que se VE en cada lámina de la Clase 6 de Formación Ajedrez.
 *
 * Una entrada por lámina, en el mismo orden que
 * cursos/recursos/formacion-ajedrez/presentaciones/clase-06/diapositivas.json.
 * El título grande de cada lámina NO está acá: sale del `titulo` de ese
 * archivo. Esta sesión no trae posiciones: no hay tableros.
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
    t: "Sesión 6", s: "Talleres prácticos y simulacros de arbitraje" },
  // 2
  { tipo: "filas", k: "Al terminar la sesión podrás…", items: [
    { ic: "🧑‍⚖️", t: "Arbitrar una ronda simulada", s: "con todo lo visto en el curso" },
    { ic: "📋", t: "Observar con la lista de cotejo", s: "y dar retroalimentación útil" },
    { ic: "🗂️", t: "Conocer los formularios", s: "de la sesión presencial" },
    { ic: "🎒", t: "Confirmar roles y materiales", s: "para el torneo real" } ] },
  // 3
  { tipo: "crono", k: "4 horas · 240 minutos", items: [
    ["0:00", "Repaso y tarea"],
    ["0:10", "Guía del simulacro y roles"],
    ["0:35", "Lista de cotejo y formularios"],
    ["1:00", "Receso", true],
    ["1:10", "Simulacro 1 en salas"],
    ["2:00", "Retroalimentación del simulacro 1"],
    ["2:25", "Receso", true],
    ["2:35", "Simulacro 2, rotando roles"],
    ["3:25", "Roles para la sesión presencial"],
    ["3:45", "Cierre"] ] },
  // 4
  { tipo: "tarjetas", k: "Tres roles en cada sala", items: [
    { ic: "🧑‍⚖️", t: "Árbitra", s: "aplica los cuatro pasos y decide en voz alta" },
    { ic: "♟️", t: "Dos jugadores", s: "actúan una incidencia de la guía" },
    { ic: "📋", t: "Observadora", s: "marca Sí o No y anota observaciones" } ],
    clave: "Quien arbitra no conoce la incidencia. Al final, se rotan los roles." },
  // 5
  { tipo: "tarjetas", k: "Con ella se evalúa el torneo presencial", cols: 3, compacto: true, items: [
    { ic: "🪪", t: "Acreditación y emparejamiento", s: "antes de iniciar la ronda" },
    { ic: "📖", t: "Reglas y reclamos", s: "según el reglamento" },
    { ic: "⏱️", t: "Incidencias con el reloj", s: "con criterio" },
    { ic: "🟥", t: "Sanciones", s: "faltas y dispositivos" },
    { ic: "🔢", t: "Desempates", s: "bien calculados" },
    { ic: "🤝", t: "Trato y registro", s: "imparcial y con cada incidencia anotada" } ] },
  // 6
  { tipo: "receso" },
  // 7
  { tipo: "tarjetas", k: "Un torneo real · los roles rotan", items: [
    { ic: "🧑‍⚖️", t: "Árbitro principal", s: "decide las incidencias y coordina al equipo" },
    { ic: "👀", t: "Auxiliares", s: "supervisan mesas, informan y aplican lo acordado" },
    { ic: "🖥️", t: "Mesa de control", s: "inscripción, emparejamientos, resultados y desempates" } ],
    clave: "Cada persona llena la lista de cotejo de otra al menos una ronda." },
  // 8
  { tipo: "frase", k: "Guion A · El enroque dudoso", ic: "pieza:bK",
    t: "Las negras enrocan largo.",
    s: "Las blancas reclaman: el rey ya se había movido en la jugada 9 y había vuelto.",
    clave: "Piensa tu decisión antes de pasar." },
  // 9
  { tipo: "filas", k: "Guion A · El enroque dudoso", numerar: true, items: [
    { ic: "📋", t: "Se revisan las planillas" },
    { ic: "↩️", t: "Si el rey se movió: ilegal", s: "se repone la posición", tono: "no" },
    { ic: "pieza:bK", t: "Debe mover el rey", s: "pieza tocada" },
    { ic: "⏱️", t: "Tiempo para el rival", s: "la compensación que corresponde al ritmo" } ] },
  // 10
  { tipo: "frase", k: "Guion B · Reclamo de triple repetición", ic: "🔁",
    t: "Detiene el reloj: «la posición se repitió tres veces».",
    s: "Todavía no hizo la jugada que produciría la tercera repetición.",
    clave: "Piensa tu decisión antes de pasar." },
  // 11
  { tipo: "dos", k: "Guion B · Reclamo de triple repetición",
    izq: { t: "Cómo se reclama", items: [
      ["Anota la jugada sin hacerla", ""],
      ["Llama al árbitro sin tocar piezas", ""],
      ["Se verifica con las planillas", ""] ] },
    der: { t: "Qué se decide", items: [
      ["Correcto: tablas de inmediato", "", "si"],
      ["Incorrecto: cuenta como oferta de tablas", "", "no"],
      ["En clásico, +2 minutos al rival", ""] ] } },
  // 12
  { tipo: "frase", k: "Guion C · La oferta de tablas en el turno del rival", ic: "🤝",
    t: "Ofrece tablas mientras corre el reloj de su rival.",
    clave: "Piensa tu decisión antes de pasar." },
  // 13
  { tipo: "ciclo", k: "Guion C · El orden correcto", pasos: ["Hace la jugada", "Ofrece tablas", "Presiona el reloj"],
    items: [
      { ic: "✅", t: "La oferta es válida", s: "pero hacerla en el turno del rival molesta: se le recuerda el orden" },
      { ic: "🟨", t: "Si se repite, se sanciona", s: "según el art. 12.9" } ] },
  // 14
  { tipo: "frase", k: "Guion D · El público que ayuda", ic: "🗣️",
    t: "Un docente acompañante comenta en voz baja con su estudiante.",
    s: "La partida está en curso.",
    clave: "Piensa tu decisión antes de pasar." },
  // 15
  { tipo: "tarjetas", k: "Guion D · El público que ayuda", numerar: true, items: [
    { ic: "🚪", t: "Se retira al docente", s: "de la zona de juego" },
    { ic: "🟥", t: "Si hubo ayuda, sanción", s: "al estudiante", a: "12.9" },
    { ic: "📝", t: "Se registra", s: "la incidencia" } ] },
  // 16
  { tipo: "receso" },
  // 17
  { tipo: "tarjetas", k: "Cada participante pasa por los dos roles", numerar: true, items: [
    { ic: "🧑‍⚖️", t: "Una persona arbitra", s: "una partida simulada" },
    { ic: "📋", t: "Otra observa", s: "y completa la lista de cotejo" },
    { ic: "🔄", t: "Luego se intercambian", s: "los roles" } ] },
  // 18
  { tipo: "frase", k: "La lista de cotejo", ic: "📋",
    t: "Resolvió bien un reclamo, pero no lo anotó en el acta.",
    s: "¿Cómo lo marcas en la lista de cotejo?" },
  // 19
  { tipo: "frase", k: "La retroalimentación", ic: "💬",
    t: "Aplicó la sanción máxima a una primera falta leve.",
    s: "Escribe una retroalimentación útil para esa persona." },
  // 20
  { tipo: "dos", k: "Respuestas de ejemplo",
    izq: { t: "1 · Lista de cotejo", items: [
      ["Resuelve los reclamos: Sí", "", "si"],
      ["Documenta cada incidencia: No", "", "no"],
      ["Con una observación concreta", ""] ] },
    der: { t: "2 · Retroalimentación", items: [
      ["La decisión tuvo base", "12.9"],
      ["Pero la sanción no fue proporcionada", ""],
      ["Primera falta leve: advertencia", ""],
      ["Sube solo si se repite", ""] ] } },
  // 21
  { tipo: "tarjetas", k: "Un minuto por pregunta", cols: 4, compacto: true, numerar: true, items: [
    { t: "Sanción omitida: ¿dónde se anota?" },
    { t: "¿Para qué asignar roles antes?" },
    { t: "Triple repetición mal reclamada: ¿qué efecto?" },
    { t: "¿En qué orden se ofrecen tablas?" },
    { t: "¿Quien arbitra conoce la incidencia?" },
    { t: "¿Qué se verifica antes de la ronda?" },
    { t: "¿Qué hace la mesa de control?" },
    { t: "¿Y el auxiliar que no puede resolver?" } ] },
  // 22
  { tipo: "tarjetas", k: "Compara con lo que escribiste", cols: 4, compacto: true, numerar: true, items: [
    { t: "La lista de cotejo" },
    { t: "Organización clara", s: "y evaluación ordenada" },
    { t: "Cuenta como oferta de tablas" },
    { t: "Jugada, oferta, reloj" },
    { t: "No" },
    { t: "Acreditación y emparejamiento" },
    { t: "Inscripción, pareos, resultados y desempates" },
    { t: "Informa al principal", s: "y aplica lo acordado" } ] },
  // 23
  { tipo: "tarjetas", k: "Tarea para la próxima sesión", items: [
    { ic: "🧑‍⚖️", t: "Confirma tu rol" },
    { ic: "📋", t: "Revisa la lista de cotejo" },
    { ic: "🎒", t: "Reúne los materiales", s: "para el día presencial" } ],
    clave: "¿Dudas? Este es el momento. ¡Gracias por participar!" },
];
