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
    ["0:35", "Logística de un torneo"],
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
  { tipo: "filas", k: "Sin boleta completa no hay acreditación", items: [
    { ic: "🖥️", t: "La genera la Plataforma JDE", s: "al cerrar inscripción y verificación, una por etapa", a: "27" },
    { ic: "✍️", t: "La revisan la jefatura y el comité", s: "de la etapa correspondiente", a: "28" },
    { ic: "📱", t: "Física o digital", s: "con su número de consecutivo", a: "28 y 29" },
    { ic: "⛔", t: "Con un dato malo no se recibe", s: "hasta que se corrija", a: "28", tono: "no" } ] },
  // 8
  { tipo: "filas", k: "Lo que pide el artículo 59", numerar: true, items: [
    { ic: "🪪", t: "Boleta Oficial", s: "digital o impresa", a: "59.a" },
    { ic: "🆔", t: "Identificación de cada persona", s: "en físico, o la cédula digital", a: "59.b" },
    { ic: "📧", t: "Correo del MEP en la boleta", s: "o el institucional si es privado", a: "59.c" },
    { ic: "📄", t: "Oficio de la jefatura", s: "para quien no es funcionario", a: "59.d" },
    { ic: "🧑‍🤝‍🧑", t: "Cuerpo técnico completo", s: "con una adulta del mismo sexo que las atletas", a: "60.e" } ] },
  // 9
  { tipo: "tarjetas", k: "Uno de estos, vigente y en físico · art. 59.e", cols: 4, compacto: true, numerar: true, items: [
    { ic: "🪪", t: "Cédula de identidad" },
    { ic: "🧒", t: "Tarjeta de identidad de menores" },
    { ic: "🛂", t: "Pasaporte" },
    { ic: "🌐", t: "Carné consular" },
    { ic: "🏅", t: "Carné oficial JDE", s: "con foto, firma y sello" },
    { ic: "🎓", t: "Carné estudiantil", s: "con foto, firma y sello" },
    { ic: "📜", t: "Certificación del centro", s: "con membrete; vale para toda la delegación" },
    { ic: "📱", t: "Cédula digital del TSE", s: "la única que no es física" } ] },
  // 10
  { tipo: "dos", k: "En ajedrez: descalificación",
    izq: { t: "También se revisa", items: [
      ["Categoría por edad y nivel", "17"],
      ["Por equipos suben hasta 3", "18"],
      ["Una sola modalidad", "66.1.h"],
      ["Equipos de 3 a 5", "66.1.g"] ] },
    der: { t: "Descalificación", tono: "no", items: [
      ["Sin Boleta Oficial", "90.f", "no"],
      ["Sin identificación", "90.g", "no"],
      ["Datos cambiados sin permiso", "90.l", "no"] ] },
    clave: "Llegar tarde no descalifica: juega hasta que caiga su reloj (art. 30)." },
  // 11
  { tipo: "filas", k: "Lo acordado va al Acta Oficial y no se cambia · art. 34", items: [
    { ic: "👥", t: "Circuital, Regional e Interregional", s: "comité, una persona por delegación y cuerpo arbitral", a: "33" },
    { ic: "🏆", t: "Nacional", s: "solo una persona por delegación, después de acreditar", a: "33" },
    { ic: "🚪", t: "Quien no asiste", s: "acepta todos los acuerdos", a: "34", tono: "ojo" },
    { ic: "⚖️", t: "Jurado de Competencia", s: "se integra en el congresillo de la Nacional", a: "35" } ] },
  // 12
  { tipo: "filas", k: "En todas las etapas", items: [
    { ic: "pieza:wN", t: "Sistema y ritmo", s: "según la etapa y los inscritos", a: "66.2" },
    { ic: "🧮", t: "Tres desempates o más", s: "los fija la persona árbitra principal", a: "66.4" },
    { ic: "🔢", t: "Orden de tableros", s: "fijo toda la etapa; suplencias por sistema olímpico", a: "66.2.h" },
    { ic: "🧹", t: "Inscripciones depuradas", s: "repetidas, dos modalidades, equipos con menos de 3", a: "66.1" },
    { ic: "📮", t: "Denuncias y apelaciones", s: "ante quién y en qué plazo", a: "81, 85 y 86" } ] },
  // 13
  { tipo: "dos", k: "Dentro de la Normativa, nunca contra ella",
    izq: { t: "Se puede", tono: "si", items: [
      ["Los desempates y su orden", "66.4"],
      ["Rondas del suizo, desde 5", "66.2.a"],
      ["Lo que no está previsto", "66"],
      ["Depurar inscripciones", ""] ] },
    der: { t: "No se puede", tono: "no", items: [
      ["Ritmo menor que 10 + 2", "66.2", "no"],
      ["Menos de tres desempates", "66.4", "no"],
      ["Sumar estudiantes", "90.l", "no"],
      ["Cambiar tableros o el acta", "34", "no"] ] } },
  // 14
  { tipo: "tarjetas", k: "Simulacro con el Excel de la sesión", cols: 4, compacto: true, items: [
    { ic: "pieza:wP", t: "Partidas = inscritos ÷ 2", s: "si son impares, uno queda libre" },
    { ic: "👥", t: "Tableros = encuentros × 4", s: "en el torneo por equipos" },
    { ic: "🪑", t: "Mesas dobles = tableros ÷ 2", s: "redondeado hacia arriba" },
    { ic: "⏱️", t: "Por cada tablero", s: "piezas, reloj y 2 sillas, + 10 % de repuesto" } ],
    clave: "Regional de Alajuela 2026: 74 mesas dobles y 142 tableros y relojes." },
  // 15
  { tipo: "foto", k: "Tacho Chess 2: la sala lista para la ronda", foto: "tacho-chess-2-sala.jpg",
    items: [
      { ic: "🪑", t: "Mesas en filas largas", s: "con pasillos entre filas" },
      { ic: "🚧", t: "Una tela separa al público", s: "nadie de afuera entra" },
      { ic: "🧾", t: "Una mesa aparte", s: "control, resultados y repuestos" } ],
    clave: "El plano siguiente ordena una sala así." },
  // 16
  { tipo: "sala", k: "Regional de Alajuela 2026: 15 torneos a la vez",
    control: "Mesa de control · árbitro principal",
    tela: "Tela o cinta: aquí termina la zona de juego",
    publico: "Público",
    leyenda: "Debajo de cada fila: tableros · mesas dobles. Ab abierto, M mujeres, Eq equipos. A1 a A8: árbitros de sala.",
    zonas: [2, 2, 2, 2, 4, 1, 1, 1],
    filas: [
      { t: "A Ab", mesas: 4, tableros: 7 },
      { t: "B Ab", mesas: 7, tableros: 13 },
      { t: "A M", mesas: 2, tableros: 3 },
      { t: "C Ab", mesas: 8, tableros: 15 },
      { t: "B M", mesas: 4, tableros: 7 },
      { t: "C M", mesas: 5, tableros: 9 },
      { t: "D Ab", mesas: 8, tableros: 16 },
      { t: "E Ab", mesas: 1, tableros: 2 },
      { t: "D M", mesas: 3, tableros: 6 },
      { t: "Eq A Ab", mesas: 2, tableros: 4, eq: true },
      { t: "Eq B M", mesas: 2, tableros: 4, eq: true },
      { t: "Eq C M", mesas: 2, tableros: 4, eq: true },
      { t: "Eq B Ab", mesas: 10, tableros: 20, eq: true },
      { t: "Eq C Ab", mesas: 8, tableros: 16, eq: true },
      { t: "Eq D Ab", mesas: 8, tableros: 16, eq: true },
    ] },
  // 17
  { tipo: "tabla", k: "Regional de Alajuela 2026, todo a la vez", cab: ["Material", "Llevar", "Cálculo"], filas: [
    ["Mesas dobles", "", "76", "", "74 + 2 de control"],
    ["Sillas", "", "288", "", "2 por tablero + 4"],
    ["Juegos y tableros", "", "157", "", "142 + 15 de repuesto"],
    ["Relojes", "", "157", "", "142 + 15, a 10 min + 2 s"],
    ["Baterías", "", "36", "", "1 por 4 relojes"],
    ["Planillas", "", "2033", "", "2 por partida y ronda + 10 %"],
    ["Hojas de resultados", "", "171", "", "por ronda o encuentro + 10 %"],
    ["Personas árbitras", "", "9", "", "8 de sala + la principal"],
    ["Sala", "", "304 m²", "", "4 m² por mesa (supuesto)"] ] },
  // 18
  { tipo: "mesa", k: "Todas las mesas iguales", items: [
    { ic: "pieza:wK", t: "Blancas a la izquierda", s: "del árbitro, de frente al reloj" },
    { ic: "⏱️", t: "Reloj a la derecha", s: "de las negras" },
    { ic: "pieza:wR", t: "Esquina blanca", s: "a la derecha de cada uno", a: "FIDE 2.1" },
    { ic: "✍️", t: "Planilla y lapicero", s: "ordenada y listo para usar" },
    { ic: "🔢", t: "Número de mesa", s: "a la vista del árbitro" } ],
    clave: "Izquierda blancas, derecha negras: el resultado se anota sin dudar." },
  // 19
  { tipo: "fotos", k: "Dónde se para el árbitro", items: [
    { foto: "arbitro-mal-colocado.jpg", tono: "no", t: "Mal colocado", s: "el reloj le queda incómodo", credito: "Foto: Amruta Mokal" },
    { foto: "arbitro-bien-colocado.jpg", tono: "si", t: "Bien colocado", s: "de frente al reloj, sin estorbar", credito: "Foto: Copa del Mundo FIDE 2021" } ] },
  // 20
  { tipo: "receso" },
  // 21
  { tipo: "ciclo", k: "Ronda a ronda, el mismo orden",
    pasos: ["Publicar el pareo", "Iniciar puntual", "Observar el apuro", "Recoger resultados", "Emparejar la siguiente"],
    items: [
      { ic: "✍️", t: "Resultados firmados y revisados", s: "e ingresados antes de emparejar la ronda siguiente" },
      { ic: "🏆", t: "Al final", s: "tabla con desempates, acta, informe de incidencias y premiación" } ] },
  // 22
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
  // 23
  { tipo: "filas", k: "Caso 1 · La ronda que empezó tarde", items: [
    { ic: "⏰", t: "Llega 5 minutos tarde", s: "tolerancia: 10; la ronda salió 20 minutos tarde" },
    { ic: "pieza:wR", t: "El rival completa una jugada ilegal", s: "suizo escolar a 15 min + 5 s" },
    { ic: "📱", t: "Suena el celular del que llegó tarde", s: "el reglamento lo sanciona con la pérdida" } ] },
  // 24
  { tipo: "tarjetas", k: "Caso 1 · La ronda que empezó tarde", items: [
    { ic: "⏰", t: "Juega", s: "llegó dentro de la tolerancia, con 5 minutos menos", tono: "si" },
    { ic: "↩️", t: "Ilegal: se corrige", s: "se repone la posición y quien llegó tarde recibe 1 minuto", tono: "ojo" },
    { ic: "📱", t: "Celular: pierde", s: "según el reglamento", tono: "no" } ],
    clave: "Todo al acta, y se revisa por qué la ronda salió tarde." },
  // 25
  { tipo: "frase", k: "Caso 2 · Empate en el primer lugar", ic: "🏆",
    t: "Dos estudiantes empatan el primer lugar… y su partida también fue tablas.",
    s: "Todos contra todos de 6. Bases: encuentro directo, Sonneborn-Berger y número de victorias." },
  // 26
  { tipo: "filas", k: "Caso 2 · Empate en el primer lugar", escalera: true, items: [
    { ic: "🤝", t: "Encuentro directo", s: "no los separa" },
    { ic: "🧮", t: "Sonneborn-Berger", s: "como en el ejemplo de la sesión 3" },
    { ic: "🏅", t: "Número de victorias", s: "si siguen empatados" },
    { ic: "⚔️", t: "Para la próxima", s: "si el puesto da el título, desempate jugado en las bases" } ] },
  // 27
  { tipo: "frase", k: "Caso 3 · La logística que falló", ic: "🧰",
    t: "Faltan 4 relojes y 3 tableros tienen piezas incompletas.",
    s: "Está por empezar la ronda 1, con 30 estudiantes inscritos." },
  // 28
  { tipo: "tarjetas", k: "Caso 3 · La logística que falló", cols: 4, compacto: true, items: [
    { ic: "🧰", t: "Repuestos", s: "se usan los que hay" },
    { ic: "pieza:wN", t: "Piezas", s: "de otros juegos, revisando cada tablero" },
    { ic: "⏱️", t: "Mesas sin reloj", s: "control anunciado, o junto a la mesa de control" },
    { ic: "📝", t: "Registro", s: "y repuestos en la lista del día presencial" } ],
    clave: "Se reorganiza sin perder la puntualidad." },
  // 29
  { tipo: "receso" },
  // 30
  { tipo: "frase", k: "Trabajo en grupos", ic: "👥",
    t: "Analicen un caso integrador y presenten su solución fundamentada.",
    s: "Combina reglas de competición, desempates y logística." },
  // 31
  { tipo: "ciclo", k: "El método, con un caso ya conocido",
    pasos: ["Hechos", "Artículo", "Decisión", "Registro"],
    items: [
      { ic: "📱", t: "El caso «suena un celular»", s: "el de la sesión 2" },
      { ic: "📝", t: "Redacta el registro", s: "tal como irá en el acta" } ] },
  // 32
  { tipo: "frase", k: "Logística", ic: "📋",
    t: "Escribe la lista de materiales.",
    s: "Torneo individual de 40 estudiantes, en mesas dobles." },
  // 33
  { tipo: "frase", k: "Desde el público", ic: "👀",
    t: "Un familiar le señala a su hija una jugada.",
    s: "¿Qué haces?" },
  // 34
  { tipo: "tarjetas", k: "Ejercicios 1 a 3", cols: 3, compacto: true, numerar: true, items: [
    { ic: "📱", t: "Pierde la partida", s: "o la sanción menor del reglamento; al acta con ronda, mesa y firma", a: "11.3.2" },
    { ic: "🧰", t: "10 mesas dobles", s: "20 tableros, piezas y relojes, + 2 de repuesto; 40 sillas" },
    { ic: "🚷", t: "Se retira al familiar", s: "si hubo ayuda, sanción a la jugadora (12.9)", a: "11.3.1 y 12.7" } ] },
  // 35
  { tipo: "tarjetas", k: "Responde de forma individual", cols: 4, compacto: true, numerar: true, items: [
    { t: "¿Qué NO es logística previa?" },
    { t: "Sin regla exacta: ¿qué prima?" },
    { t: "¿Los cuatro pasos de un caso?" },
    { t: "¿Qué se revisa antes de emparejar?" },
    { t: "¿Dónde se atiende al público?" },
    { t: "¿Qué más anuncian las bases?" },
    { t: "¿Dónde y cómo se comunica una decisión?" } ] },
  // 36
  { tipo: "tarjetas", k: "Responde de forma individual", items: [
    { ic: "8️⃣", t: "Quiere apelar: ¿qué le informas?" },
    { ic: "9️⃣", t: "¿Qué se arma al cerrar el torneo?" } ] },
  // 37
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
  // 38
  { tipo: "tarjetas", k: "Antes de la próxima sesión", items: [
    { ic: "📚", t: "Tarea", s: "propuesta logística breve para un torneo de tu región: inscripción, espacios, materiales y personal" },
    { ic: "👋", t: "¿Dudas?", s: "este es el momento. ¡Gracias por participar!" } ] },
];

/*! rev bfb5bbb0d2d82f9f */
