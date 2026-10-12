/* Lo que se VE en cada lámina de la Clase 1 de Formación Ajedrez.
 *
 * Una entrada por lámina, en el mismo orden que
 * cursos/recursos/formacion-ajedrez/presentaciones/clase-01/diapositivas.json.
 * El título grande de cada lámina NO está acá: sale del `titulo` de ese
 * archivo, que es también lo que se dice en voz al cambiar de lámina. Las
 * posiciones tampoco: un tablero dice `pos: n` y se dibuja la n-ésima de las
 * `posiciones` de esa lámina, ya comprobadas con chess.js.
 *
 * Una lámina dice poco a propósito (ver «Las láminas dicen poco» en
 * docs/decisiones/clase-en-vivo.md): lo que el profe explica en voz va en
 * las `notas` del JSON y la transcripción completa sigue en su `texto`.
 * verificar-formacion-laminas.js cuenta las palabras de cada una.
 *
 * Tonos de una marca: "si" (verde), "no" (rojo), "ojo" (ámbar), "info" (azul). El color
 * nunca va solo: la marca lleva siempre su palabra escrita.
 */
module.exports = [
  // 1
  { tipo: "portada", k: "Formación de Personas Árbitras y Asesoras · JDE",
    t: "Clase 1", s: "Rol arbitral, reglas básicas y notación" },
  // 2
  { tipo: "filas", k: "Al terminar la sesión podrás…", items: [
    { ic: "🗺️", t: "Explicar el curso", s: "organización, evaluaciones y sesión presencial" },
    { ic: "🧑‍⚖️", t: "Describir el rol arbitral", s: "deberes y límites en los JDE" },
    { ic: "pieza:wN", t: "Aplicar las reglas", s: "movimiento, enroque, al paso, coronación, pieza tocada" },
    { ic: "🏁", t: "Distinguir cómo termina", s: "jaque, mate, ahogado, posición muerta, tablas" },
    { ic: "✍️", t: "Leer y escribir partidas", s: "notación algebraica y planilla" } ] },
  // 3
  { tipo: "tarjetas", k: "El camino hacia el arbitraje en los JDE", numerar: true, items: [
    { ic: "💻", t: "6 sesiones virtuales", s: "de 4 horas cada una" },
    { ic: "📝", t: "Evaluación continua", s: "quizzes y tareas" },
    { ic: "♟️", t: "Sesión presencial", s: "14 de diciembre, con tableros y relojes reales" } ],
    clave: "En los JDE, quien arbitra también forma." },
  // 4
  { tipo: "tarjetas", k: "Para aprender mejor juntos", items: [
    { ic: "📷", t: "Cámara encendida", s: "en explicaciones y salas" },
    { ic: "🎙️", t: "Micrófono apagado", s: "salvo para participar" },
    { ic: "💬", t: "Dudas al chat", s: "se responden al final del bloque" },
    { ic: "👥", t: "En las salas", s: "una persona anota y otra presenta" } ] },
  // 5
  { tipo: "crono", k: "4 horas · 240 minutos", items: [
    ["0:00", "Bienvenida y encuadre"],
    ["0:10", "El rol arbitral"],
    ["0:35", "Reglas I: piezas y jugadas especiales"],
    ["1:15", "Receso", true],
    ["1:25", "Reglas II: cómo termina una partida"],
    ["2:00", "Notación y planilla"],
    ["2:25", "Receso", true],
    ["2:35", "Práctica en salas"],
    ["3:15", "Quiz y errores frecuentes"],
    ["3:45", "Cierre"] ] },
  // 6
  { tipo: "cita", k: "Prólogo de las Leyes del Ajedrez",
    cita: "Las Leyes no pueden prever todas las situaciones.",
    s: "Si ningún artículo lo resuelve, se decide por analogía con casos parecidos.",
    items: [ { ic: "⚖️", t: "Ecuanimidad" }, { ic: "🧠", t: "Lógica" }, { ic: "🔍", t: "Factores especiales" } ] },
  // 7
  { tipo: "tarjetas", k: "Las Leyes del Ajedrez, en cuatro partes", items: [
    { ic: "📘", t: "Reglas básicas", s: "el juego, la posición inicial y los movimientos" },
    { ic: "⏱️", t: "Reglas de competición", s: "reloj, irregularidades, anotación, tablas y conducta" },
    { ic: "📎", t: "Apéndices", s: "rápidas, blitz, notación y personas ciegas" },
    { ic: "🧭", t: "Directrices", s: "aplazadas, Ajedrez 960 y partidas sin incremento" } ] },
  // 8
  { tipo: "filas", k: "Más allá de observar", cols: 2, items: [
    { ic: "📖", t: "Hacer cumplir las Leyes", a: "12.1" },
    { ic: "🪑", t: "Buenas condiciones de juego", a: "12.2.3 y 12.2.4" },
    { ic: "♿", t: "Atender la discapacidad", a: "12.2.6" },
    { ic: "🛡️", t: "Velar por el juego limpio", a: "12.2.1 y 12.2.7" },
    { ic: "👀", t: "Observar, sobre todo en apuro de tiempo", a: "12.3" },
    { ic: "🟥", t: "Hacer cumplir y sancionar", a: "12.3 y 12.9" } ] },
  // 9
  { tipo: "chips", k: "Lo que se espera de quien arbitra", items: [
    { ic: "📖", t: "Cumplir las reglas" }, { ic: "🛡️", t: "Juego limpio" },
    { ic: "🏆", t: "El bien del torneo" }, { ic: "😊", t: "Buen ambiente" },
    { ic: "⏩", t: "Que el torneo avance" }, { ic: "✅", t: "Hacer cumplir decisiones" },
    { ic: "🟨", t: "Sancionar si hace falta" }, { ic: "🤚", t: "No intervenir sin motivo" },
    { ic: "🤝", t: "Respeto" }, { ic: "📵", t: "Sin distracciones" },
    { ic: "⚖️", t: "Imparcialidad" }, { ic: "⏰", t: "Puntualidad" },
    { ic: "♿", t: "Apoyo a quien lo necesita" }, { ic: "🗓️", t: "Ir a las reuniones" } ] },
  // 10
  { tipo: "tarjetas", k: "Quién hace qué", cols: 3, items: [
    { ic: "🧑‍⚖️", t: "Principal", s: "lidera y responde por lo técnico" },
    { ic: "🔗", t: "Adjuntos", s: "enlace con los asistentes" },
    { ic: "🗺️", t: "De sector", s: "vigilan un área del salón" },
    { ic: "📋", t: "Asistentes", s: "controlan partidas y anotan resultados" },
    { ic: "🛡️", t: "Juego limpio", s: "previenen las trampas" },
    { ic: "🔀", t: "De pareo", s: "publican pareos y resultados" } ] },
  // 11
  { tipo: "tarjetas", k: "Arts. 12.4 y 12.7", items: [
    { ic: "⚖️", t: "Imparcialidad", s: "sin favorecer centros, regiones ni estudiantes" },
    { ic: "🧑‍⚖️", t: "Principal y adjuntos", s: "lo difícil lo decide el principal", a: "12.4" },
    { ic: "🙊", t: "El público no interviene", s: "solo puede avisarle al árbitro", a: "12.7" } ] },
  // 12
  { tipo: "dos", k: "Los límites durante la partida",
    izq: { tono: "si", t: "Puede", items: [
      ["Explicar una regla si se la piden", "11.9"],
      ["Detener los relojes para resolver", ""],
      ["Corregir una ilegal sin esperar reclamo", "4.8 y 7.5"],
      ["Pedir silencio y orden", ""] ] },
    der: { tono: "no", t: "No debe", items: [
      ["Avisar jaque, mate o ahogado", "12.6"],
      ["Decir cuántas jugadas van", "12.6"],
      ["Avisar que el rival ya jugó", "12.6"],
      ["Sugerir jugadas ni comentar", ""] ] } },
  // 13
  { tipo: "filas", k: "Art. 12.9 · el árbitro elige según la falta", escalera: true, items: [
    { ic: "🗣️", t: "Advertencia" },
    { ic: "⏱️", t: "Ajuste de tiempo", s: "más tiempo al rival o menos al infractor" },
    { ic: "🔢", t: "Ajuste de puntos", s: "más puntos al rival o menos al infractor" },
    { ic: "🚫", t: "Partida perdida o expulsión", s: "de una o más rondas, o del torneo" } ] },
  // 14
  { tipo: "tarjetas", k: "Si quien juega no puede…", items: [
    { ic: "✋", t: "Mover las piezas" },
    { ic: "⏱️", t: "Usar el reloj" },
    { ic: "✍️", t: "Anotar" } ],
    clave: "…puede traer un asistente que el árbitro acepte." },
  // 15
  { tipo: "tarjetas", k: "Durante la partida", items: [
    { ic: "📝", t: "Sin notas ni consejos", s: "ni analizar en otro tablero" },
    { ic: "📵", t: "Sin dispositivos", s: "salvo los que apruebe el árbitro" },
    { ic: "🟥", t: "Si lo lleva encima", s: "pierde la partida", tono: "no" },
    { ic: "🔍", t: "Inspección", s: "de ropa y bolsos, en privado" } ] },
  // 16
  { tipo: "tarjetas", k: "Arts. 11.9 a 11.11", items: [
    { ic: "❓", t: "Pedir explicación", s: "de cualquier punto de las Leyes", a: "11.9" },
    { ic: "📣", t: "Apelar", s: "aunque ya haya firmado la planilla", a: "11.10" },
    { ic: "🤝", t: "Cooperar", s: "al reconstruir la partida o reclamar tablas", a: "11.11" } ] },
  // 17
  { tipo: "tablero", k: "Art. 2", pos: 0, opciones: { destacar: ["h1", "a8"] }, items: [
    { ic: "⬜", t: "Casilla clara a la derecha", s: "h1 y a8, marcadas" },
    { ic: "pieza:wQ", t: "La dama en su color", s: "blanca en d1, negra en d8" },
    { ic: "⚠️", t: "¿Mal colocado?", s: "decide el árbitro (art. 7)" } ] },
  // 18
  { tipo: "tarjetas", k: "Art. 3 · las seis piezas", cols: 3, compacto: true, items: [
    { ic: "pieza:wK", t: "Rey", s: "una casilla, a cualquier lado" },
    { ic: "pieza:wQ", t: "Dama", s: "fila, columna o diagonal" },
    { ic: "pieza:wR", t: "Torre", s: "fila o columna" },
    { ic: "pieza:wB", t: "Alfil", s: "en diagonal" },
    { ic: "pieza:wN", t: "Caballo", s: "en L, y salta" },
    { ic: "pieza:wP", t: "Peón", s: "avanza 1 (2 al salir), captura en diagonal" } ],
    clave: "Legal solo si no deja al propio rey en jaque (3.9 y 3.10)." },
  // 19
  { tipo: "tableros", k: "Art. 3.8.2 · el rey no pasa por una casilla atacada", items: [
    { pos: 0, tono: "no", marca: "No se puede", t: "Enroque corto", s: "el rey pasaría por f1, atacada",
      opciones: { flechas: [["c4", "f1"]], destacar: ["f1"] } },
    { pos: 1, tono: "si", marca: "Sí se puede", t: "Enroque largo", s: "b1 está atacada, pero por ahí pasa la torre",
      opciones: { flechas: [["f5", "b1"]], destacar: ["b1"] } } ] },
  // 20
  { tipo: "tablero", k: "Art. 3.7.4.1", pos: 0, opciones: { flechas: [["e5", "d6"]], destacar: ["d7", "d5"] }, items: [
    { ic: "⏩", t: "Las negras jugaron d7-d5", s: "pasando junto al peón de e5" },
    { ic: "✅", t: "Se captura: exd6 a.p.", s: "el peón blanco va a d6", tono: "si" } ],
    clave: "Solo en la jugada inmediata siguiente." },
  // 21
  { tipo: "filas", k: "Art. 3.7.5", numerar: true, items: [
    { ic: "pieza:wQ", t: "Dama, torre, alfil o caballo", s: "aunque no se haya capturado ninguna" },
    { ic: "✋", t: "¿Falta la pieza?", s: "pausa el reloj y la pide al árbitro (6.11.4)" },
    { ic: "👆", t: "Vale al tocar la casilla", s: "la pieza nueva, no el peón (4.4.4)" },
    { ic: "🟥", t: "Reloj sin cambiar el peón", s: "ilegal: pasa a dama y hay sanción (7.5.2)", tono: "no" } ] },
  // 22
  { tipo: "dos", k: "Art. 7.5",
    izq: { t: "Cuenta como ilegal", items: [
      ["Una jugada imposible", ""],
      ["Jugar con dos manos", "7.5.4"],
      ["Presionar el reloj sin jugar", "7.5.3"] ] },
    der: { t: "Qué hace el árbitro", items: [
      ["Vuelve a la posición anterior", "7.5.1"],
      ["1.ª: +2 minutos al rival (+1 en rápidas)", "7.5.5", "ojo"],
      ["2.ª: pierde (tablas si el rival no puede dar mate)", "7.5.5", "no"] ] },
    clave: "La jugada se completa al presionar el reloj." },
  // 23
  { tipo: "filas", k: "Arts. 4.1 a 4.8", items: [
    { ic: "✋", t: "Pieza propia: la mueve", a: "4.3" },
    { ic: "🎯", t: "Pieza rival: la captura", a: "4.3" },
    { ic: "pieza:wK", t: "Rey y torre: enroca", a: "4.4.1" },
    { ic: "pieza:wR", t: "Torre primero: mueve la torre, sin enroque", a: "4.4.2" },
    { ic: "🔧", t: "«Compongo»: en su turno y avisando antes", a: "4.2.1" } ] },
  // 24
  { tipo: "tarjetas", k: "¿Qué harías tú?", items: [
    { ic: "pieza:wR", t: "Caso 1", s: "Toma primero la torre para enrocar corto" },
    { ic: "pieza:wP", t: "Caso 2", s: "Deja el peón en e8 y presiona el reloj" },
    { ic: "⏳", t: "Caso 3", s: "Captura al paso dos jugadas tarde" } ],
    clave: "Piensa tu respuesta antes de pasar." },
  // 25
  { tipo: "tarjetas", k: "Decisiones arbitrales", items: [
    { ic: "pieza:wR", t: "Caso 1", s: "Mueve esa torre y ya no enroca por ese lado", a: "4.4.2" },
    { ic: "pieza:wQ", t: "Caso 2", s: "Ilegal: el peón pasa a dama y el rival recibe +2 min", a: "7.5.2 y 7.5.5", tono: "ojo" },
    { ic: "↩️", t: "Caso 3", s: "Ilegal: se vuelve atrás y hay sanción", a: "3.7.4.1 y 7.5.5", tono: "ojo" } ] },
  // 26
  { tipo: "receso" },
  // 27
  { tipo: "tabla", k: "Arts. 5 y 9", cab: ["Situación", "Resultado", "¿Qué pasa?"], filas: [
    ["Jaque", "3.9.1", "Sigue", "", "No se reclama"],
    ["Jaque mate", "5.1.1", "Gana quien da mate", "si", "Termina en el acto"],
    ["Ahogado", "5.2.1", "Tablas", "ojo", "Termina en el acto"],
    ["Posición muerta", "5.2.2", "Tablas", "ojo", "Termina en el acto"],
    ["Acuerdo", "9.1", "Tablas", "ojo", "Se ofrecen y se aceptan"],
    ["Triple repetición", "9.2", "Tablas", "ojo", "Reclama quien tiene el turno"],
    ["50 jugadas", "9.3", "Tablas", "ojo", "Reclama quien tiene el turno"],
    ["Quíntuple o 75 jugadas", "9.6", "Tablas", "ojo", "Interviene el árbitro"] ] },
  // 28
  { tipo: "tableros", k: "Juegan las negras", items: [
    { pos: 0, tono: "si", marca: "Mate", t: "Mate del pasillo", s: "tras Te8 no hay salida", opciones: { destacar: ["g8"] } },
    { pos: 1, tono: "ojo", marca: "Tablas", t: "Ahogado", s: "sin jaque y sin jugadas", opciones: { destacar: ["a8"] } },
    { pos: 2, tono: "info", marca: "Sigue", t: "No es ahogado", s: "el peón de h7 puede avanzar", opciones: { destacar: ["h7"] } } ] },
  // 29
  { tipo: "tableros", k: "Art. 5.2.2 · tablas en el acto", items: [
    { pos: 0, tono: "ojo", marca: "Tablas", t: "Rey y alfil", s: "nunca hay mate" },
    { pos: 1, tono: "info", marca: "Sigue", t: "Rey y dos caballos", s: "el mate es posible si el otro ayuda" } ],
    clave: "Rey contra rey: ya son tablas, sin reclamo." },
  // 30
  { tipo: "filas", k: "Arts. 9.2 a 9.5", items: [
    { ic: "🔁", t: "Misma posición", s: "mismo turno, mismas piezas y los mismos derechos", a: "9.2.3" },
    { ic: "✍️", t: "Cómo se reclama", s: "escribe la jugada sin hacerla y llama al árbitro", a: "9.2" },
    { ic: "✋", t: "Si toca una pieza", s: "pierde el reclamo en esa jugada", a: "9.4" },
    { ic: "⚖️", t: "Reclamo correcto: tablas", s: "incorrecto: hace la jugada y +2 min al rival", a: "9.5" } ] },
  // 31
  { tipo: "notacion", k: "Obligatoria en competencia · art. 8.1 y apéndice C", items: [
    { t: "Casilla", ej: "e4", s: "columna y fila" },
    { t: "Piezas", ej: "R D T A C", s: "el peón no lleva letra" },
    { t: "Jugada", ej: "Cf3", s: "pieza y casilla de llegada" } ],
    signos: [["x", "captura"], ["+", "jaque"], ["#", "mate"], ["O-O", "enroque corto"],
             ["O-O-O", "enroque largo"], ["=D", "corona"], ["a.p.", "al paso"], ["(=)", "oferta de tablas"]] },
  // 32
  { tipo: "planilla", k: "Las dos columnas, jugada a jugada",
    jugadas: [["e4", "e5"], ["Cf3", "Cc6"], ["Ab5", "a6"], ["Axc6", "dxc6"], ["O-O", ""]],
    pie: "Apertura Española",
    items: [
      { ic: "🤔", t: "¿Qué pasó?", ej: "1.f3 e5 2.g4 Dh4#", s: "Mate del loco: el más rápido" },
      { ic: "🔎", t: "¿Qué está mal?", ej: "1.e4 e5 2.Rf3", s: "R es el rey; el caballo es C", tono: "no" } ] },
  // 33
  { tipo: "filas", k: "Art. 8", cols: 2, items: [
    { ic: "✍️", t: "Anotar las dos jugadas, una a una", a: "8.1" },
    { ic: "🚫", t: "No anotar antes de jugar", s: "salvo para reclamar tablas", a: "8.1" },
    { ic: "👀", t: "Siempre a la vista del árbitro", a: "8.1" },
    { ic: "🤝", t: "Las ofertas de tablas: (=)", a: "8.1 y 9.1" },
    { ic: "⏳", t: "Con menos de 5 min y sin incremento, no anota", a: "8.4" },
    { ic: "✒️", t: "Los dos firman las dos planillas", s: "firmar no quita apelar", a: "8.7" } ] },
  // 34
  { tipo: "ciclo", k: "Art. 8.1", pasos: ["En juego", "Toca la pieza", "Hace la jugada", "Presiona el reloj", "Anota"],
    items: [
      { ic: "📋", t: "Clara y legible", s: "en algebraica, en papel o en planilla electrónica FIDE" },
      { ic: "↔️", t: "Puede contestar antes de anotar", s: "pero anota antes de su siguiente jugada (8.1.3)" } ] },
  // 35
  { tipo: "tarjetas", k: "Arts. 8.1.4 a 8.7", items: [
    { ic: "📋", t: "Solo para la partida", s: "jugadas, tiempos, ofertas de tablas y reclamos" },
    { ic: "👀", t: "A la vista del árbitro", s: "durante toda la partida" },
    { ic: "✒️", t: "Del organizador", s: "los dos la firman con el resultado" } ],
    clave: "¿Qué revisamos en la planilla cuando una partida termina?" },
  // 36
  { tipo: "tarjetas", k: "Arts. 8.4 a 8.6", items: [
    { ic: "⏳", t: "Menos de 5 minutos", s: "sin incremento de 30 s: no anota" },
    { ic: "🧑‍⚖️", t: "Nadie anota", s: "anota el árbitro o un asistente" },
    { ic: "🚩", t: "Cae una bandera", s: "quien no anotó se pone al día" },
    { ic: "♟️", t: "Sin planilla completa", s: "se reconstruye en otro tablero" } ] },
  // 37
  { tipo: "tarjetas", k: "Arts. 8.6 y 8.7", items: [
    { ic: "🔄", t: "¿Se pasó del tiempo?", s: "si no se sabe, la siguiente jugada abre el nuevo periodo" },
    { ic: "✒️", t: "El resultado firmado vale", s: "aunque esté mal, salvo que el árbitro decida otra cosa" } ],
    clave: "¿Qué revisamos en la planilla cuando una partida termina?" },
  // 38
  { tipo: "receso" },
  // 39
  { tipo: "filas", k: "Jugadas legales y finales de partida · 40 minutos", numerar: true, items: [
    { ic: "👥", t: "Grupos de 3 o 4", s: "una sala por grupo" },
    { ic: "♟️", t: "8 posiciones", s: "¿jaque, mate, ahogado, posición muerta o sigue?" },
    { ic: "📖", t: "Justifiquen con el artículo" },
    { ic: "🎤", t: "Una persona anota y otra presenta" } ],
    clave: "25 minutos en salas y 15 de plenaria." },
  // 40
  { tipo: "tableros", k: "¿Jaque, mate, ahogado, posición muerta o sigue?", items: [
    { pos: 0, t: "Posición 1", s: "juegan las negras" },
    { pos: 1, t: "Posición 2", s: "juegan las negras" },
    { pos: 2, t: "Posición 3", s: "juegan las negras" },
    { pos: 3, t: "Posición 4", s: "juegan las blancas" } ] },
  // 41
  { tipo: "tableros", k: "¿Jaque, mate, ahogado, posición muerta o sigue?", items: [
    { pos: 0, t: "Posición 5", s: "juegan las blancas" },
    { pos: 1, t: "Posición 6", s: "juegan las negras" },
    { pos: 2, t: "Posición 7", s: "juegan las negras" },
    { pos: 3, t: "Posición 8", s: "juegan las negras" } ] },
  // 42
  { tipo: "tarjetas", k: "Cada respuesta, con su artículo", cols: 4, compacto: true, numerar: true, items: [
    { t: "Jaque mate", s: "torre en la octava", a: "5.1", tono: "si" },
    { t: "Ahogado", s: "sin jaque y sin casillas", a: "5.2.1", tono: "ojo" },
    { t: "Jaque, sigue", s: "el rey sale a d7 o f7", a: "3.9", tono: "info" },
    { t: "Posición muerta", s: "rey y alfil", a: "5.2.2", tono: "ojo" },
    { t: "Jaque mate", s: "mate del loco", a: "5.1", tono: "si" },
    { t: "Posición muerta", s: "rey y caballo", a: "5.2.2", tono: "ojo" },
    { t: "Sigue", s: "con torre sí hay mate", a: "", tono: "info" },
    { t: "Ahogado", s: "b8 y b7 están tomadas", a: "5.2.1", tono: "ojo" } ] },
  // 43
  { tipo: "filas", k: "Lo que más se repite en los torneos estudiantiles", cols: 2, items: [
    { ic: "❌", t: "Confundir mate y ahogado", a: "5.1 y 5.2.1" },
    { ic: "pieza:wP", t: "Peón en la octava sin cambiar", a: "7.5.2" },
    { ic: "pieza:wK", t: "Enrocar tras mover el rey", a: "3.8.2" },
    { ic: "⏳", t: "Capturar al paso tarde", a: "3.7.4.1" },
    { ic: "🔁", t: "Seguir con rey contra rey", a: "5.2.2" },
    { ic: "🤝", t: "Darse la mano sin ofrecer tablas", a: "9.1" },
    { ic: "pieza:wR", t: "Tocar la torre primero para enrocar", a: "4.4.2" } ] },
  // 44
  { tipo: "tarjetas", k: "Responde de forma individual", cols: 3, compacto: true, numerar: true, items: [
    { t: "Jaque sin salida: ¿cómo se llama?" },
    { t: "Sin jaque y sin jugadas: ¿qué resultado?" },
    { t: "¿Cuándo se pierde el enroque de un lado?" },
    { t: "Rey contra rey: ¿qué corresponde?" },
    { t: "¿Cuándo se puede decir «compongo»?" },
    { t: "¿Qué se anota en la planilla?" } ] },
  // 45
  { tipo: "tarjetas", k: "Quiz: respuestas", cols: 3, compacto: true, numerar: true, items: [
    { t: "Jaque mate" },
    { t: "Ahogado: tablas" },
    { t: "Al mover el rey o esa torre", s: "aunque vuelvan a su casilla" },
    { t: "Tablas al instante", s: "posición muerta, sin reclamo" },
    { t: "En su turno", s: "y avisando antes de tocar" },
    { t: "Las dos jugadas", s: "en algebraica y legible" } ] },
  // 46
  { tipo: "tarjetas", k: "Próxima: sesión 2, reglas de competición", items: [
    { ic: "📚", t: "Tarea", s: "lee las reglas básicas de las Leyes FIDE y llena la ficha de reflexión" },
    { ic: "👋", t: "Antes de irte", s: "dudas, evaluación breve y el cuadernillo en la Academia" } ] },
];
