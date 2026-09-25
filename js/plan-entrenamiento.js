/* ===== Ajedrez Integral — Diagnóstico: áreas, nivel y plan de entrenamiento =====
 *
 * Este archivo es el criterio pedagógico del diagnóstico, y lo comparten las dos
 * pantallas que lo usan: entreno/diagnostico.html (lo que ve el alumno al
 * terminar) e informes.html (el informe y el plan que ve el profesor). Así el
 * alumno y el profesor nunca leen dos diagnósticos distintos de la misma prueba.
 *
 * Qué hay aquí:
 *   AREAS        — las ocho áreas que mide la prueba, con qué significa fallar
 *                  en cada una, qué hacer al respecto y con qué material del
 *                  sitio trabajarlo.
 *   resumir()    — convierte las respuestas en porcentaje por área, nivel
 *                  estimado, fortalezas y debilidades.
 *   generarPlan()— arma un plan de cuatro semanas: ataca primero las áreas más
 *                  flojas, sostiene las fuertes y termina con una medición.
 *
 * Sobre el nivel estimado: NO sale del porcentaje. Sale de hasta qué escalón
 * de dificultad llega el alumno. La prueba tiene cinco escalones (el peso de
 * cada ítem, de 1 a 5) con ocho preguntas de cada uno de los difíciles, y el
 * nivel es el escalón más alto que superó —al menos 60% de aciertos ahí, y el
 * promedio de los escalones anteriores también en 60%—.
 *
 * Por qué: con el porcentaje a secas, quien contesta bien todo lo fácil sale
 * con nota altísima aunque no resuelva nada difícil. Pasó de verdad: un
 * jugador de 1400 y uno de 2300 sacaron los dos "Experto" (93% y 99%). Contar
 * escalones, en cambio, pregunta "¿hasta dónde llega?" en vez de "¿cuánto
 * acertó?", que es lo que uno quiere saber para armarle el plan.
 *
 * El porcentaje se sigue calculando y se sigue mostrando por área —sirve para
 * ver dónde está flojo—, pero el nivel ya no depende de él. Sigue siendo una
 * estimación de trabajo: no es un rating oficial ni sustituye a los resultados
 * de torneo, y así se dice en pantalla.
 */
window.PlanEntrenamiento = (function () {
  "use strict";

  const AREAS = [
    {
      id: 'reglas', nombre: 'Reglas y movimientos', emoji: '📖',
      mide: 'Cómo mueve cada pieza y las reglas que más se olvidan: enroque, captura al paso, ahogado.',
      flojo: 'Todavía se le escapan reglas. Hasta que estén firmes, va a perder partidas por cosas que no tienen que ver con jugar bien.',
      solido: 'Domina el reglamento: puede concentrarse en jugar, no en recordar cómo se mueven las piezas.',
      tareas: [
        'Repasar las lecciones de Movimientos y Reglas especiales, sin saltarse el enroque ni la captura al paso.',
        'Diez posiciones diarias de "¿es mate o es ahogado?" hasta no dudar.',
        'Jugar tres partidas lentas anunciando en voz alta la regla especial cada vez que aparezca.',
      ],
      recursos: [
        { texto: 'Aprender — Cómo mueve cada pieza', href: 'entreno/aprender.html' },
        { texto: 'Ejercicios de enroque', href: 'entreno/temas.html?tema=castling' },
        { texto: 'Ejercicios de captura al paso', href: 'entreno/temas.html?tema=enPassant' },
        { texto: 'Ejercicios de coronación', href: 'entreno/temas.html?tema=promotion' },
        { texto: 'Ficha: el rey ahogado', href: 'entreno/estudio.html?ficha=rey-ahogado' },
        { texto: 'Curso: Fundamentos del Ajedrez', href: 'cursos/fundamentos-del-ajedrez.html' },
      ],
    },
    {
      id: 'material', nombre: 'Valor del material', emoji: '⚖️',
      mide: 'El valor de las piezas, las capturas seguras y cuándo un cambio conviene.',
      flojo: 'Regala o deja de cobrar material. Es lo que más rápido cambia un resultado: una pieza colgada decide la partida sola.',
      solido: 'Cuenta bien el material y no deja piezas gratis: base firme para todo lo demás.',
      tareas: [
        'Antes de cada jugada, recorrer las piezas rivales sin defensa y las propias: treinta segundos, siempre.',
        'Series de 4×4 centradas en capturas y cambios.',
        'Revisar cada partida perdida marcando la jugada exacta donde se fue el material.',
      ],
      recursos: [
        { texto: 'Ejercicios de pieza colgada', href: 'entreno/temas.html?tema=hangingPiece' },
        { texto: 'Ejercicios de capturar al defensor', href: 'entreno/temas.html?tema=capturingDefender' },
        { texto: 'Entreno 4×4', href: 'entreno/4x4.html' },
        { texto: 'Ficha: la pieza atrapada', href: 'entreno/estudio.html?ficha=pieza-atrapada' },
        { texto: 'Curso: Desequilibrios de material', href: 'cursos/desequilibrios-de-material.html' },
      ],
    },
    {
      id: 'apertura', nombre: 'Principios de apertura', emoji: '🚀',
      mide: 'Centro, desarrollo, seguridad del rey y los errores típicos de las primeras jugadas.',
      flojo: 'Sale de la apertura con desventaja o con el rey en el centro: después hay que defender toda la partida.',
      solido: 'Sale de la apertura con las piezas fuera y el rey seguro, que es todo lo que se le pide a esta fase.',
      tareas: [
        'Jugar cinco partidas siguiendo solo tres reglas: centro, desarrollo, enroque antes de la jugada 10.',
        'Repasar el curso de aperturas y quedarse con UN esquema por color, no más.',
        'Anotar en cada partida la jugada en la que terminó el desarrollo: la meta es bajar ese número.',
      ],
      recursos: [
        { texto: 'Ejercicios de apertura', href: 'entreno/temas.html?tema=opening' },
        { texto: 'Aperturas y celadas', href: 'entreno/aperturas.html' },
        { texto: 'Ejercicios sobre f2 y f7, el error típico', href: 'entreno/temas.html?tema=attackingF2F7' },
        { texto: 'Ficha: el desarrollo', href: 'entreno/estudio.html?ficha=desarrollo' },
        { texto: 'Ficha: el centro', href: 'entreno/estudio.html?ficha=el-centro' },
        { texto: 'Curso: Aperturas y Defensas', href: 'cursos/aperturas-y-defensas.html' },
        { texto: 'Artículo: el centro del tablero', href: 'articulos/el-centro-del-tablero.html' },
      ],
    },
    {
      id: 'tactica', nombre: 'Táctica', emoji: '⚔️',
      mide: 'Horquillas, clavadas, ataques dobles y descubiertos, y la rutina de revisar las amenazas del rival.',
      flojo: 'No ve los golpes tácticos —ni los suyos ni los del rival—. En estas edades y niveles, la táctica decide la mayoría de las partidas.',
      solido: 'Ve los motivos tácticos habituales: ya puede pelear cualquier partida.',
      tareas: [
        'Quince ejercicios de táctica diarios, siempre por tema (primero horquilla, después clavada, después doble).',
        'Racha táctica dos veces por semana para entrenar la vista rápida.',
        'Después de cada jugada del rival, decir en voz alta: jaques, capturas, amenazas.',
      ],
      recursos: [
        { texto: 'Ejercicios de ataque doble', href: 'entreno/temas.html?tema=fork' },
        { texto: 'Ejercicios de clavada', href: 'entreno/temas.html?tema=pin' },
        { texto: 'Ejercicios de pincho', href: 'entreno/temas.html?tema=skewer' },
        { texto: 'Ejercicios de desviación', href: 'entreno/temas.html?tema=deflection' },
        { texto: 'Racha táctica', href: 'racha-tactica.html' },
        { texto: 'Ficha: la horquilla', href: 'entreno/estudio.html?ficha=horquilla' },
        { texto: 'Curso: Estrategia y Táctica', href: 'cursos/estrategia-y-tactica.html' },
      ],
    },
    {
      id: 'mate', nombre: 'Mates y seguridad del rey', emoji: '♚',
      mide: 'Patrones de mate en 1 y 2, el mate del pasillo y el cuidado del propio rey.',
      flojo: 'Llega a posiciones ganadas y no las remata, o cae en mates conocidos. Es el arreglo más rentable que existe.',
      solido: 'Remata lo que gana y cuida su rey: convierte ventaja en punto.',
      tareas: [
        'Veinte mates en 1 al día durante una semana; después, mates en 2.',
        'Practicar los tres mates básicos (dos torres, dama y rey, torre y rey) contra el motor hasta hacerlos en menos de 20 jugadas.',
        'Hacer la ventanita al rey enrocado en todas las partidas de esta semana.',
      ],
      recursos: [
        { texto: 'Mates en 1', href: 'entreno/mates.html?cat=mate1' },
        { texto: 'Mates en 2', href: 'entreno/mates.html?cat=mate2' },
        { texto: 'Ejercicios de mate del pasillo', href: 'entreno/temas.html?tema=backRankMate' },
        { texto: 'Ejercicios de mate de la coz', href: 'entreno/temas.html?tema=smotheredMate' },
        { texto: 'Ejercicios de rey expuesto', href: 'entreno/temas.html?tema=exposedKing' },
        { texto: 'Ficha: el mate del pasillo', href: 'entreno/estudio.html?ficha=mate-pasillo' },
        { texto: 'Practicar — bloque de mates', href: 'entreno/practicas.html' },
      ],
    },
    {
      id: 'finales', nombre: 'Finales', emoji: '🏁',
      mide: 'Oposición, regla del cuadrado, coronación y las posiciones de torre que hay que saber.',
      flojo: 'Los finales se le van: empata ganados y pierde empatados. Es donde más puntos se recuperan con menos horas.',
      solido: 'Sabe llevar un final simple: puede cambiar piezas con criterio cuando le conviene.',
      tareas: [
        'Rey y peón contra rey: oposición y regla del cuadrado, hasta hacerlo sin pensar.',
        'Las primeras diez lecciones del curso de los 100 finales, una por día.',
        'Jugar finales contra el motor desde posiciones ganadas y desde posiciones de tablas.',
      ],
      recursos: [
        { texto: 'Ejercicios de final de peones', href: 'entreno/temas.html?tema=pawnEndgame' },
        { texto: 'Ejercicios de final de torres', href: 'entreno/temas.html?tema=rookEndgame' },
        { texto: 'Practicar — bloque de finales', href: 'entreno/practicas.html' },
        { texto: 'Ficha: la oposición', href: 'entreno/estudio.html?ficha=oposicion' },
        { texto: 'Ficha: la regla del cuadrado', href: 'entreno/estudio.html?ficha=regla-del-cuadrado' },
        { texto: 'Curso: El mapa de los finales', href: 'cursos/el-mapa-de-los-finales.html' },
        { texto: 'Artículo: la oposición', href: 'articulos/la-oposicion.html' },
      ],
    },
    {
      id: 'estrategia', nombre: 'Estrategia y planes', emoji: '🧭',
      mide: 'Centro, columnas abiertas, peones pasados, puestos avanzados: qué hacer cuando no hay táctica.',
      flojo: 'Juega jugada a jugada, sin plan. Se le nota en posiciones tranquilas, donde no sabe qué mejorar.',
      solido: 'Sabe elegir un plan sencillo y colocar las piezas donde sirven.',
      tareas: [
        'En cada partida, escribir el plan en una frase antes de la jugada 15 y revisarlo al final.',
        'Estudiar columnas abiertas y peones pasados en el curso de estrategia.',
        'Analizar dos partidas propias buscando la peor pieza en cada momento y adónde debía ir.',
      ],
      recursos: [
        { texto: 'Ejercicios de jugada tranquila', href: 'entreno/temas.html?tema=quietMove' },
        { texto: 'Ejercicios de medio juego', href: 'entreno/temas.html?tema=middlegame' },
        { texto: 'Ejercicios de peón avanzado', href: 'entreno/temas.html?tema=advancedPawn' },
        { texto: 'Ficha: el peón pasado', href: 'entreno/estudio.html?ficha=peon-pasado' },
        { texto: 'Ficha: la columna abierta', href: 'entreno/estudio.html?ficha=columna-abierta' },
        { texto: 'Curso: Estrategia y Táctica', href: 'cursos/estrategia-y-tactica.html' },
        { texto: 'Artículo: peones doblados', href: 'articulos/peones-doblados.html' },
      ],
    },
    {
      id: 'calculo', nombre: 'Cálculo y visualización', emoji: '🔭',
      mide: 'Ver jugadas sin mover las piezas, contar capturas en orden y encontrar jugadas intermedias.',
      flojo: 'Calcula corto o se pierde a las dos jugadas: ve el primer golpe pero no la respuesta.',
      solido: 'Calcula con orden y llega hasta el final de la variante antes de decidir.',
      tareas: [
        'Resolver cinco ejercicios diarios sin mover las piezas, diciendo la variante completa en voz alta.',
        'Entrenar coordenadas y visualización dos veces por semana.',
        'Curso de cálculo: árbol de variantes y jugadas candidatas.',
      ],
      recursos: [
        { texto: 'Visualización', href: 'entreno/visualizacion.html' },
        { texto: 'Ejercicios largos, para calcular hasta el final', href: 'entreno/temas.html?tema=veryLong' },
        { texto: 'Ejercicios de jugada intermedia', href: 'entreno/temas.html?tema=intermezzo' },
        { texto: 'Coordenadas', href: 'entreno/coordenadas.html' },
        { texto: 'Concentración', href: 'concentracion.html' },
        { texto: 'Curso: Cálculo y Visualización', href: 'cursos/calculo-y-visualizacion.html' },
      ],
    },
  ];

  /* La novena área. Es la que el banco de Oscar llama «un tema adicional un
     poco más difícil»: no mide una habilidad del tablero como las otras ocho,
     sino lo que rodea al juego —cultura ajedrecística, reglamento de torneo,
     Elo y títulos, motores y bases de datos, partidas históricas—. Por eso sus
     tareas no son de entrenamiento técnico sino de lectura y de competir. */
  AREAS.push({
    id: 'maestria', nombre: 'Maestría', emoji: '🎓',
    mide: 'Lo que rodea al tablero: reglamento de torneo, Elo y títulos, motores y bases de datos, y las partidas que hay que conocer.',
    flojo: 'Sabe jugar, pero le falta el mundo alrededor: cómo funciona un torneo, qué dice el Elo, qué hacen los motores. Eso se nota apenas sale a competir.',
    solido: 'Se mueve con soltura en el ambiente del ajedrez: entiende el reglamento, sabe leer una evaluación de motor y conoce las partidas de referencia.',
    tareas: [
      'Leer el reglamento del próximo torneo antes de jugarlo: ritmo, incremento y criterios de desempate.',
      'Repasar una partida histórica por semana (la Inmortal, la del Siglo, alguna de Capablanca) siguiéndola en un tablero.',
      'Analizar dos partidas propias con motor, primero sin verlo: anotar dónde uno cree que se equivocó y recién después comparar.',
    ],
    recursos: [
      { texto: 'Ejercicios de partidas de maestros', href: 'entreno/temas.html?tema=master' },
      { texto: 'Ejercicios de partidas de súper GM', href: 'entreno/temas.html?tema=superGM' },
      { texto: 'Diagnóstico de arbitraje', href: 'nivel-de-arbitraje.html' },
      { texto: 'Curso: Partidas modelo del ajedrez moderno', href: 'cursos/partidas-modelo.html' },
      { texto: 'Curso: Preparación para Torneos', href: 'cursos/preparacion-para-torneos.html' },
    ],
  });

  const AREA_POR_ID = {};
  AREAS.forEach((a) => { AREA_POR_ID[a.id] = a; });

  // Tramos de nivel, de menor a mayor. El rango de fuerza es orientativo y así
  // se muestra siempre: ubica al alumno para elegir material, no certifica un rating.
  /* `escalon` es el peso de ítem que hay que superar para llegar a este nivel.
     `desde` es el porcentaje que hacía falta en la prueba VIEJA (la que no
     tenía escalones 4 y 5): se conserva tal cual para no re-etiquetar los
     resultados que se midieron con ella. Maestro lleva `desde: null` justamente
     por eso: es un nivel que aquella prueba no podía distinguir. */
  /* Los cinco niveles y su tramo de Elo, como los fijó Oscar. Dos cosas que
     conviene tener presentes al tocarlos:

     - El tramo de Principiante es enorme (hasta 1399) porque recoge a todo el
       que todavía está aprendiendo. Por eso el Elo estimado NO es el centro del
       tramo sino un valor interpolado según el porcentaje (ver eloEstimado):
       con el centro, quien saca 2 % y quien saca 28 % recibirían el mismo
       número, y eso no le sirve a nadie.
     - La lista que llegó tenía un hueco: Básico terminaba en 1599 e Intermedio
       arrancaba en 1601, así que el 1600 no caía en ningún nivel. Se cierra
       acá, en Intermedio.
     - Arriba de 2199 se sigue siendo «Muy avanzado»: es el último tramo y tiene
       que quedar abierto, o alguien de 2300 se quedaría sin nivel.
     - El piso de Principiante es 400 y no 0: cero no es una puntuación que
       exista. Es solo el extremo del que arranca la interpolación; el corte
       que decide el nivel sigue siendo 1400. */
  const NIVELES = [
    { clave: 'principiante', escalon: 0, desde: 0,  hasta: 29,  elo: [400, 1399],  etiqueta: 'Principiante', rango: 'hasta 1399',
      descripcion: 'Está aprendiendo las reglas y a no dejar piezas. El objetivo de estas semanas es jugar sin errores de reglamento y contar bien el material.' },
    { clave: 'basico',       escalon: 1, desde: 30, hasta: 49,  elo: [1400, 1599], etiqueta: 'Básico',       rango: '1400 a 1599',
      descripcion: 'Ya juega partidas completas. Toca asentar la táctica básica y los mates elementales: es lo que decide sus partidas hoy.' },
    { clave: 'intermedio',   escalon: 2, desde: 50, hasta: 69,  elo: [1600, 1799], etiqueta: 'Intermedio',   rango: '1600 a 1799',
      descripcion: 'Tiene base. Ahora los puntos se ganan con finales, planes y cálculo ordenado, más que con nuevas aperturas.' },
    { clave: 'avanzado',     escalon: 3, desde: 70, hasta: 86,  elo: [1800, 1999], etiqueta: 'Avanzado',     rango: '1800 a 1999',
      descripcion: 'Juega bien en general. Conviene trabajar por debilidades concretas y preparar torneos con partidas largas analizadas.' },
    { clave: 'muy_avanzado', escalon: 4, desde: 87, hasta: 100, elo: [2000, 2199], etiqueta: 'Muy avanzado', rango: '2000 o más',
      descripcion: 'Resuelve también lo difícil: cálculo largo, técnica de finales y criterio posicional. El plan pasa a ser preparación de competencia: repertorio propio, análisis con motor y trabajo por rival.' },
  ];

  const ESCALONES = [1, 2, 3, 4, 5];
  const UMBRAL_ESCALON = 0.6;   // 60% de aciertos para dar un escalón por superado

  function nivelDe(porcentaje) {
    let nivel = NIVELES[0];
    NIVELES.forEach((n) => { if (n.desde !== null && porcentaje >= n.desde) nivel = n; });
    return nivel;
  }

  // ---- Elo ----
  /* Si el alumno registró su Elo (Configuración › Perfil, columna profiles.elo),
     el diagnóstico lo tiene en cuenta: el nivel que dio la prueba se traduce a
     una fuerza aproximada (el centro de su tramo) y se combina con el Elo
     declarado según lo fiable que sea su origen (FIDE pesa más que un rating en
     línea). El nivel sale de esa combinación —sin saltarse el tope por áreas— y
     la diferencia entre lo que dice la prueba y lo que dice el Elo se comenta
     (lecturaElo): un Elo por encima de la prueba señala huecos que se compensan
     con experiencia; por debajo, falta rodaje de torneo. El alumno o su profesor
     pueden ir ajustando el Elo y el análisis se recalcula. */
  /* `peso` es cómo se mezclaba el Elo con la prueba hasta la versión 4 (se
     conserva para calificar esos resultados igual que entonces). `desvio` es
     lo que se usa desde la versión 5: cuánto puede errar ese Elo como medida
     de la fuerza de hoy, en puntos. Un FIDE sale de decenas de partidas lentas
     contra rivales medidos; uno en línea, de otro ritmo y otra población (y a
     menudo inflado respecto al FIDE), así que dice bastante menos. */
  const ELO_TIPOS = [
    { id: 'fide',     etiqueta: 'FIDE',                         peso: 0.6,  desvio: 100 },
    { id: 'nacional', etiqueta: 'Federación nacional',          peso: 0.5,  desvio: 150 },
    { id: 'online',   etiqueta: 'En línea (Lichess, Chess.com)', peso: 0.4,  desvio: 250 },
    { id: 'estimado', etiqueta: 'Estimado por el profesor',     peso: 0.35, desvio: 200 },
  ];
  const ELO_TIPO_POR_ID = {};
  ELO_TIPOS.forEach((t) => { ELO_TIPO_POR_ID[t.id] = t; });
  const ELO_MIN = 100, ELO_MAX = 3500;
  // Los cortes salen de los propios tramos de NIVELES: una sola fuente.
  const ELO_CORTES = NIVELES.slice(1).map((n) => n.elo[0]);
  function nivelDeElo(elo) {
    let i = 0;
    ELO_CORTES.forEach((c) => { if (elo >= c) i += 1; });
    return NIVELES[Math.min(i, NIVELES.length - 1)];
  }
  function eloDeNivel(nivel) {
    const n = NIVELES[Math.max(0, NIVELES.indexOf(nivel))];
    return Math.round((n.elo[0] + n.elo[1]) / 2);
  }
  /* El Elo estimado se interpola DENTRO del tramo según el porcentaje, en vez
     de devolver el centro. Importa sobre todo en Principiante, que va de 0 a
     1399: con el centro, quien acertó el 2 % y quien acertó el 28 % saldrían
     los dos con el mismo número. */
  function eloEstimado(nivel, porcentaje) {
    const n = NIVELES[Math.max(0, NIVELES.indexOf(nivel))];
    const ancho = n.hasta - n.desde;
    if (!ancho || typeof porcentaje !== 'number') return eloDeNivel(n);
    const dentro = Math.min(1, Math.max(0, (porcentaje - n.desde) / ancho));
    return Math.round(n.elo[0] + dentro * (n.elo[1] - n.elo[0]));
  }
  function eloValido(v) {
    const n = typeof v === 'number' ? v : parseInt(v, 10);
    return Number.isFinite(n) && n >= ELO_MIN && n <= ELO_MAX ? Math.round(n) : null;
  }
  function lecturaElo(declarado, estimado, tipo, error) {
    const dif = declarado - estimado;
    const origen = ELO_TIPO_POR_ID[tipo] ? ELO_TIPO_POR_ID[tipo].etiqueta : 'declarado';
    // Con el margen de la prueba (versión 5), «coinciden» es estar dentro de él.
    if (Math.abs(dif) < Math.max(150, error || 0)) {
      return { clave: 'coherente', dif, texto: `El Elo (${declarado}, ${origen}) y la prueba (≈${estimado}) cuentan lo mismo: la estimación es sólida y el plan puede seguirse tal cual.` };
    }
    if (dif > 0) {
      return { clave: 'prueba_baja', dif, texto: `El Elo (${declarado}, ${origen}) está ${dif} puntos por encima de lo que muestra la prueba (≈${estimado}). Suele significar que en torneo compensa con experiencia, ritmo y lucha, pero tiene huecos concretos en las áreas flojas; cerrarlos es lo que permite el siguiente salto de rating.` };
    }
    return { clave: 'prueba_alta', dif, texto: `La prueba (≈${estimado}) muestra ${-dif} puntos más de fuerza que el Elo (${declarado}, ${origen}). Sabe más de lo que rinde: falta rodaje de torneo, manejo del reloj y calma en la partida real. Conviene sumar partidas largas y torneos al plan.${tipo === 'online' ? '' : ' Si el Elo es antiguo o de pocas partidas, también puede estar quedado.'}` };
  }

  /* ===== Medición en escala Elo (diagnósticos de la versión 5 en adelante) =====

     Qué se cambió y por qué. Con los escalones, la prueba dejó de distinguir a
     nadie por encima de unos 1450 puntos: en los 80 diagnósticos rendidos hasta
     septiembre de 2026, un 1463 sacó 92 %, un 1527 93 %, un 2033 93 % y un
     2100 98 %, y todos los que pasaron del 80 % acertaron prácticamente TODAS
     las preguntas del banco (ver docs/decisiones/entrenamiento.md). Contar
     escalones no arregla eso: si las preguntas más difíciles las resuelve
     cualquiera de 1450, no hay escalera que mida 1800.

     Ahora cada pregunta tiene su dificultad en puntos Elo (`item.elo`): la
     fuerza con la que se acierta la mitad de las veces. Las de tablero salen
     del rating de Lichess del ejercicio; las demás, de las respuestas reales
     (herramientas/diagnostico-calibrar.js). Con eso, la fuerza del alumno es la
     que mejor explica sus aciertos y fallos, con la misma curva del Elo:

        P(acierto) = azar + (1 − azar) / (1 + 10^((dificultad − fuerza) / 400))

     `azar` es lo que se acierta sin saber: 0,2 en las de opción (hay cuatro y
     «No lo sé»; quien no sabe y marca igual acierta a veces) y 0 en las de
     mover en el tablero, donde no hay nada que adivinar. Así acertar una
     pregunta difícil de mover pesa mucho más que acertar una de opción, que es
     lo que corresponde.

     La cuenta es por grilla (de 100 a 3300, de 5 en 5): media y desvío de la
     fuerza dados los aciertos. Se le pone un punto de partida muy amplio
     (1500 ± 800) solo para que quien acierta todo o nada tenga un número finito;
     con 60 preguntas casi no pesa. El desvío es el margen que se muestra
     («≈1720 ± 110»): cuánto puede errar la prueba, dicho en voz alta. */
  const ESCALA_ELO = 400;
  const PARTIDA = { media: 1500, desvio: 800 };
  /* Los cortes de los escalones en puntos: un ítem de dificultad 1550 es del
     escalón 3. Los usan el banco (qué `peso` le toca a cada pregunta) y el
     generador de ítems de Lichess. */
  const ESCALON_ELO = [1100, 1400, 1700, 2000];
  function escalonDeElo(elo) {
    let e = 1;
    ESCALON_ELO.forEach((c) => { if (elo >= c) e += 1; });
    return e;
  }
  function azarDe(item) {
    return item && (item.tipo === 'opcion' || item.tipo === 'opcion_tablero') ? 0.2 : 0;
  }
  function probabilidad(fuerza, dificultad, azar) {
    return azar + (1 - azar) / (1 + Math.pow(10, (dificultad - fuerza) / ESCALA_ELO));
  }
  /* `items`: los de la prueba (con `elo`); `respuestas`: { id: true|false }.
     Lo que no se contestó no cuenta; «No lo sé» cuenta como fallo, que es lo
     que es para la medición (y a la vez la más honesta: sin azar). */
  function medir(items, respuestas, partida) {
    const p0 = partida || PARTIDA;
    const datos = (items || []).filter((i) => typeof i.elo === 'number' && respuestas && i.id in respuestas)
      .map((i) => ({ b: i.elo, c: azarDe(i), ok: !!respuestas[i.id] }));
    const grilla = [];
    let max = -Infinity;
    for (let t = 100; t <= 3300; t += 5) {
      let lp = -0.5 * Math.pow((t - p0.media) / p0.desvio, 2);
      datos.forEach((d) => {
        const p = probabilidad(t, d.b, d.c);
        lp += Math.log(d.ok ? p : 1 - p);
      });
      grilla.push([t, lp]);
      if (lp > max) max = lp;
    }
    let s = 0, m = 0, m2 = 0;
    grilla.forEach(([t, lp]) => { const w = Math.exp(lp - max); s += w; m += w * t; m2 += w * t * t; });
    const media = m / s;
    const desvio = Math.sqrt(Math.max(0, m2 / s - media * media));
    /* Lo que cabía esperar en cada área con esa fuerza (en % de puntos): con
       preguntas difíciles, un 50 % en un área puede ser lo normal para un
       2000. Un hueco es sacar MUCHO menos que eso (ver topePorHuecos). */
    const esperado = {};
    const suma = {};
    (items || []).filter((i) => typeof i.elo === 'number' && respuestas && i.id in respuestas).forEach((i) => {
      const a = suma[i.area] || (suma[i.area] = { p: 0, e: 0 });
      a.p += i.peso;
      a.e += i.peso * probabilidad(media, i.elo, azarDe(i));
    });
    Object.keys(suma).forEach((k) => { esperado[k] = Math.round((suma[k].e / suma[k].p) * 100); });
    return { elo: Math.round(media), error: Math.round(desvio), preguntas: datos.length, modelo: 'elo-400', esperado };
  }
  /* El tope por áreas de la versión 5. La idea es la de siempre —nadie con
     los finales en blanco es «muy avanzado»—, pero ya no se puede medir con
     el porcentaje a secas: con la mitad de la prueba difícil, un jugador de
     2000 saca 50 % en un área sin tener ningún hueco, y el tope de antes
     (menos de 50 % → como mucho Avanzado) lo bajaba sin razón. Ahora un hueco
     es quedar muy por debajo de lo esperable para su propia fuerza: 45 puntos
     o más por debajo → como mucho Avanzado; 60 o más → como mucho Intermedio.
     Los márgenes son anchos a propósito: un área tiene de cinco a nueve
     preguntas y el azar solo mueve su porcentaje ±20 puntos; con estos
     márgenes, a alguien sin huecos casi nunca le toca un tope por mala suerte
     (comprobado con simulaciones: ver docs/decisiones/entrenamiento.md). */
  /* La «nota» de un área: lo que decide su banda (a trabajar / en camino /
     firme, con los cortes de siempre en 60 y 80) y el orden del plan.
     - Hasta la versión 4 es el porcentaje, como siempre.
     - Desde la 5, el porcentaje ya no sirve para eso: con la mitad de la prueba
       difícil, un 1500 saca 30 % en casi todas las áreas sin tener ningún
       hueco, y todas saldrían «a trabajar». Además las áreas no tienen el mismo
       reparto de preguntas difíciles, así que ordenar por porcentaje mandaría
       siempre al plan las que más preguntas duras tienen (táctica, cálculo), no
       las flojas de ese alumno. La nota es entonces 70 + (porcentaje −
       esperado): lo esperable para su fuerza queda en 70 («en camino»), diez
       puntos por debajo ya es «a trabajar» y diez por encima, «firme». Un 80 %
       o más sigue siendo firme, sea lo que sea que se esperara. */
  function notaDeArea(porcentaje, esperado) {
    if (typeof esperado !== 'number') return porcentaje;
    const nota = Math.max(0, Math.min(100, Math.round(70 + porcentaje - esperado)));
    return porcentaje >= 80 ? Math.max(80, nota) : nota;
  }
  const BANDAS_AREA = [
    { clave: 'firme', desde: 80, etiqueta: 'firme' },
    { clave: 'camino', desde: 60, etiqueta: 'en camino' },
    { clave: 'trabajar', desde: 0, etiqueta: 'a trabajar' },
  ];
  function bandaDeNota(nota) { return BANDAS_AREA.find((b) => nota >= b.desde); }

  function topePorHuecos(porArea, esperado) {
    let tope = NIVELES.length - 1;
    (porArea || []).forEach((a) => {
      if (!esperado || typeof esperado[a.id] !== 'number' || !a.total) return;
      const falta = esperado[a.id] - a.porcentaje;
      if (falta >= 60) tope = Math.min(tope, 2);
      else if (falta >= 45) tope = Math.min(tope, 3);
    });
    return tope;
  }
  /* Junta la prueba con el Elo declarado: dos mediciones de lo mismo, cada una
     con su margen, pesan según lo precisas que son. Un FIDE (± 100) y una
     prueba bien contestada (± 110) pesan casi igual; un Elo en línea (± 250)
     pesa bastante menos que la prueba. */
  function combinar(prueba, errorPrueba, declarado, tipo) {
    const t = ELO_TIPO_POR_ID[tipo] || ELO_TIPO_POR_ID.estimado;
    const wp = 1 / Math.pow(Math.max(40, errorPrueba), 2);
    const we = 1 / Math.pow(t.desvio, 2);
    return {
      elo: Math.round((wp * prueba + we * declarado) / (wp + we)),
      error: Math.round(Math.sqrt(1 / (wp + we))),
    };
  }

  /* Resultados por escalón de dificultad, que es de donde sale el nivel.
     `dificultad` viene del diagnóstico: { 1: {aciertos, total}, 2: {...}, ... } */
  function porEscalon(dificultad) {
    return ESCALONES.map((peso) => {
      const d = (dificultad || {})[peso] || (dificultad || {})[String(peso)] || { aciertos: 0, total: 0 };
      const total = d.total || 0;
      return {
        peso, total, aciertos: d.aciertos || 0, nosabe: d.nosabe || 0,
        porcentaje: total ? Math.round((d.aciertos / total) * 100) : null,
      };
    });
  }

  /* El escalón más alto superado. Se exige acertar el 60% DE ESE escalón y que
     el promedio de los anteriores también llegue al 60%: así un tropiezo suelto
     en una pregunta fácil no tapa a quien resuelve lo difícil, pero acertar dos
     de ocho preguntas duras por descarte tampoco sube de nivel. */
  function escalonAlcanzado(escalones) {
    for (let i = escalones.length - 1; i >= 0; i--) {
      const e = escalones[i];
      if (e.total === 0 || e.porcentaje === null) continue;
      const hasta = escalones.slice(0, i + 1).filter((x) => x.total > 0);
      const promedio = hasta.reduce((s, x) => s + x.porcentaje, 0) / hasta.length;
      if (e.porcentaje >= UMBRAL_ESCALON * 100 && promedio >= UMBRAL_ESCALON * 100) return e.peso;
    }
    return 0;
  }

  /* Tope por áreas: la escalera dice hasta dónde llega, pero un área en blanco
     no se compensa con las otras. Nadie con los finales en cero es maestro,
     por bien que resuelva la táctica difícil — y al revés, ese hueco es
     justamente lo que el plan tiene que atacar. */
  function topePorAreas(porArea) {
    if (!porArea || !porArea.length) return NIVELES.length - 1;
    const minima = Math.min.apply(null, porArea.map((a) => a.porcentaje));
    if (minima < 30) return 2;   // como mucho Intermedio
    if (minima < 50) return 3;   // como mucho Avanzado
    return NIVELES.length - 1;
  }

  function nivelPorEscalones(dificultad, porArea) {
    const escalones = porEscalon(dificultad);
    const tope = topePorAreas(porArea);
    /* escalonAlcanzado devuelve de 0 a 5 y los niveles son cinco: el escalón 5
       y el 4 caen los dos en el último. Sin este tope, un alumno que supera el
       escalón 5 se quedaba sin nivel (NIVELES[5] no existe). */
    const alcanzado = Math.min(escalonAlcanzado(escalones), tope, NIVELES.length - 1);
    return { escalones, alcanzado, nivel: NIVELES[alcanzado], topeAreas: tope };
  }

  /* Convierte el detalle guardado del diagnóstico en algo legible.
     `detalle` es lo que escribe entreno/diagnostico.html en training_progress:
     { version, perfil, areas: { <areaId>: { peso, logrado, aciertos, total } }, ... } */
  function resumir(detalle) {
    const areas = (detalle && detalle.areas) || {};
    const porArea = AREAS.map((a) => {
      const d = areas[a.id] || { peso: 0, logrado: 0, aciertos: 0, total: 0, nosabe: 0 };
      const porcentaje = d.peso ? Math.round((d.logrado / d.peso) * 100) : 0;
      return {
        id: a.id, nombre: a.nombre, emoji: a.emoji, mide: a.mide,
        porcentaje, nota: porcentaje, aciertos: d.aciertos || 0, total: d.total || 0,
        // Cuántas dijo no saber: un hueco que enseñar, distinto de un error que corregir.
        nosabe: d.nosabe || 0,
      };
    });
    const pesoTotal = porArea.reduce((s, a) => s + (areas[a.id] ? areas[a.id].peso : 0), 0);
    const logradoTotal = porArea.reduce((s, a) => s + (areas[a.id] ? areas[a.id].logrado : 0), 0);
    const porcentaje = pesoTotal ? Math.round((logradoTotal / pesoTotal) * 100) : 0;
    const ordenadas = porArea.slice().sort((a, b) => a.porcentaje - b.porcentaje);
    /* Con `dificultad` (pruebas nuevas) el nivel sale de los escalones; sin
       ella —resultados de antes, medidos con otra prueba— se sigue usando el
       porcentaje, que es lo único que hay y es como se calificaron entonces. */
    const medicion = detalle && detalle.medicion && typeof detalle.medicion.elo === 'number' ? detalle.medicion : null;
    const perfil = (detalle && detalle.perfil) || {};
    const declarado = eloValido(perfil.elo);
    /* Versión 5 en adelante: el nivel sale de la fuerza medida en puntos
       (ver «Medición en escala Elo»), no de los escalones. Los escalones se
       siguen calculando porque son la mejor forma de mostrar hasta dónde
       llegó, pero ya no deciden. */
    if (medicion) {
      porArea.forEach((a) => {
        if (medicion.esperado && typeof medicion.esperado[a.id] === 'number') {
          a.esperado = medicion.esperado[a.id];
          a.nota = notaDeArea(a.porcentaje, a.esperado);
        }
      });
      const porNota = porArea.slice().sort((a, b) => a.nota - b.nota);
      const escalones = porEscalon(detalle.dificultad);
      const tope = topePorHuecos(porArea, medicion.esperado);
      const conTope = (e) => NIVELES[Math.min(NIVELES.indexOf(nivelDeElo(e)), tope)];
      const estimado = medicion.elo;
      let elo = { declarado: null, tipo: null, estimado, error: medicion.error, combinado: estimado, errorCombinado: medicion.error, lectura: null };
      if (declarado) {
        const tipo = ELO_TIPO_POR_ID[perfil.elo_tipo] ? perfil.elo_tipo : 'estimado';
        const c = combinar(estimado, medicion.error, declarado, tipo);
        elo = { declarado, tipo, tipoEtiqueta: ELO_TIPO_POR_ID[tipo].etiqueta, estimado, error: medicion.error,
                combinado: c.elo, errorCombinado: c.error, lectura: lecturaElo(declarado, estimado, tipo, medicion.error) };
      }
      /* «Hasta qué escalón llega»: el último cuyo centro queda por debajo de la
         fuerza medida (centros: 950, 1250, 1550, 1850 y 2150). */
      let alcanzado = 0;
      [950, 1250, 1550, 1850, 2150].forEach((c, i) => { if (estimado >= c) alcanzado = i + 1; });
      return {
        porArea, porcentaje, modelo: 'elo',
        nivel: conTope(elo.combinado), nivelPrueba: conTope(estimado), elo,
        escalones, escalonAlcanzado: alcanzado, topeAreas: tope,
        aciertos: porArea.reduce((s, a) => s + a.aciertos, 0),
        total: porArea.reduce((s, a) => s + a.total, 0),
        nosabe: porArea.reduce((s, a) => s + a.nosabe, 0),
        debilidades: porNota.filter((a) => a.nota < 60).slice(0, 3),
        fortalezas: porNota.slice().reverse().filter((a) => a.nota >= 80),
        perfil, fecha: (detalle && detalle.fecha) || null,
      };
    }
    const conEscalones = detalle && detalle.dificultad
      ? nivelPorEscalones(detalle.dificultad, porArea)
      : { escalones: porEscalon(null), alcanzado: null, nivel: nivelDe(porcentaje) };
    // Elo: el declarado en el perfil (si lo hay) frente al que sugiere la prueba.
    const estimado = eloEstimado(conEscalones.nivel, porcentaje);
    let nivel = conEscalones.nivel;
    let elo = { declarado: null, tipo: null, estimado, combinado: estimado, lectura: null };
    if (declarado) {
      const tipo = ELO_TIPO_POR_ID[perfil.elo_tipo] ? perfil.elo_tipo : 'estimado';
      const w = ELO_TIPO_POR_ID[tipo].peso;
      const combinado = Math.round(w * declarado + (1 - w) * estimado);
      elo = { declarado, tipo, tipoEtiqueta: ELO_TIPO_POR_ID[tipo].etiqueta, estimado, combinado, lectura: lecturaElo(declarado, estimado, tipo) };
      const tope = conEscalones.topeAreas === undefined ? NIVELES.length - 1 : conEscalones.topeAreas;
      nivel = NIVELES[Math.min(NIVELES.indexOf(nivelDeElo(combinado)), tope)];
    }
    return {
      porArea,
      porcentaje,
      nivel,
      nivelPrueba: conEscalones.nivel,
      elo,
      escalones: conEscalones.escalones,
      escalonAlcanzado: conEscalones.alcanzado,
      topeAreas: conEscalones.topeAreas === undefined ? null : conEscalones.topeAreas,
      aciertos: porArea.reduce((s, a) => s + a.aciertos, 0),
      total: porArea.reduce((s, a) => s + a.total, 0),
      nosabe: porArea.reduce((s, a) => s + a.nosabe, 0),
      debilidades: ordenadas.filter((a) => a.porcentaje < 60).slice(0, 3),
      fortalezas: ordenadas.slice().reverse().filter((a) => a.porcentaje >= 80),
      perfil: (detalle && detalle.perfil) || {},
      fecha: (detalle && detalle.fecha) || null,
    };
  }

  // Minutos diarios sugeridos según el nivel: ni pedirle una hora a quien recién
  // empieza, ni quedarse corto con quien ya compite.
  const RUTINA = {
    principiante: '15 minutos al día, 4 días por semana',
    basico: '20 minutos al día, 5 días por semana',
    intermedio: '30 minutos al día, 5 días por semana',
    avanzado: '40 minutos al día, 5 días por semana',
    muy_avanzado: '1 hora al día, 6 días por semana',
    // Claves de niveles viejos, para los resultados guardados con ellos.
    experto: '1 hora al día, 6 días por semana',
  };

  /* Plan de cuatro semanas. La regla pedagógica: una sola área por semana (dos
     focos a la vez no se sostienen), las más flojas primero porque son las que
     más puntos devuelven, y la última semana para juntar todo y volver a medir.
     Si no hay debilidades claras, el plan se ordena igual por las áreas más
     bajas: siempre hay una que va última. */
  function generarPlan(resumen) {
    // Se ordena por la nota del área (ver notaDeArea): en los diagnósticos
    // viejos es el porcentaje; en los nuevos, cuánto rinde respecto de su fuerza.
    const nota = (a) => (typeof a.nota === 'number' ? a.nota : a.porcentaje);
    const ordenadas = resumen.porArea.slice().sort((a, b) => nota(a) - nota(b));
    // Solo entran al plan las áreas que de verdad tienen margen: dedicarle una
    // semana a algo que ya está al 100% es tiempo que no se le da a lo flojo.
    const candidatas = ordenadas.filter((a) => nota(a) < 85);
    const focos = candidatas.slice(0, 3).map((a) => AREA_POR_ID[a.id]);
    const fuertes = resumen.fortalezas.map((a) => AREA_POR_ID[a.id]);

    const semanas = focos.map((area, i) => {
      const dato = resumen.porArea.find((p) => p.id === area.id);
      return {
        numero: i + 1,
        area: area.id,
        titulo: `Semana ${i + 1} · ${area.emoji} ${area.nombre}`,
        porque: typeof dato.esperado === 'number'
          ? (nota(dato) < 60
            ? `${dato.porcentaje}% en el diagnóstico, cuando con su fuerza cabía esperar un ${dato.esperado}%. ${area.flojo}`
            : `${dato.porcentaje}% en el diagnóstico (con su fuerza cabía esperar un ${dato.esperado}%): es de lo más bajo que tiene, y afinarlo sostiene todo lo demás.`)
          : dato.porcentaje < 60
            ? `${dato.porcentaje}% en el diagnóstico. ${area.flojo}`
            : `${dato.porcentaje}% en el diagnóstico: es de lo más bajo que tiene, y afinarlo sostiene todo lo demás.`,
        objetivo: typeof dato.esperado === 'number'
          ? `Que ${area.nombre.toLowerCase()} deje de ser lo más flojo: en la próxima medición, al menos el ${Math.min(95, Math.max(dato.porcentaje + 10, dato.esperado + 10))}% en esa área.`
          : `Subir ${area.nombre.toLowerCase()} por encima del ${Math.min(95, Math.max(70, dato.porcentaje + 20))}% en la próxima medición.`,
        tareas: area.tareas.slice(),
        recursos: area.recursos.slice(),
      };
    });

    // Con pocas áreas flojas, la semana que sobra se juega y se analiza: a partir
    // de cierto nivel, lo que falta ya no son temas sino partidas revisadas.
    if (semanas.length < 3) {
      semanas.push({
        numero: semanas.length + 1,
        area: 'juego',
        titulo: `Semana ${semanas.length + 1} · ♟️ Partidas largas y análisis`,
        porque: 'Con las áreas técnicas al día, lo que más rinde es jugar en serio y revisar lo jugado.',
        objetivo: 'Tres partidas largas analizadas, con las tres decisiones clave anotadas en cada una.',
        tareas: [
          'Tres partidas de 25 minutos o más, anotadas.',
          'Analizar cada una primero sin motor y después con motor: anotar dónde se torció.',
          'Llevar al profesor la posición más difícil de las tres.',
        ],
        recursos: [
          { texto: 'Jugar contra el profe', href: 'tablero.html' },
          { texto: 'Juegos de la Academia', href: 'juegos.html' },
        ],
      });
    }

    // Con Elo por debajo de lo que muestra la prueba, lo que falta es rodaje: la
    // semana de partidas entra sí o sí (si no estaba) y con meta de torneo.
    const elo = resumen.elo || {};
    if (elo.lectura && elo.lectura.clave === 'prueba_alta' && !semanas.some((s) => s.area === 'juego')) {
      const quitada = semanas.length >= 3 ? semanas.pop() : null; // la tercera área floja cede su semana
      semanas.push({
        numero: semanas.length + 1,
        area: 'juego',
        titulo: `Semana ${semanas.length + 1} · ♟️ Rodaje de torneo`,
        porque: `La prueba muestra más fuerza (≈${elo.estimado}) que el Elo (${elo.declarado}): sabe más de lo que rinde en partida real.${quitada ? ' Esta semana sustituye a ' + quitada.titulo.split(' · ')[1] + ', que queda para el siguiente ciclo.' : ''}`,
        objetivo: `Cuatro partidas largas con reloj, anotadas, y una inscripción a torneo. Meta de Elo: ${elo.declarado + 50} en los próximos torneos.`,
        tareas: [
          'Cuatro partidas de 25 minutos o más, con reloj y anotadas; sin abandonar ninguna.',
          'Después de cada partida, anotar en qué jugada se gastó más tiempo y por qué.',
          'Inscribirse en el próximo torneo disponible y llevar las planillas al profesor.',
        ],
        recursos: [
          { texto: 'Torneos en vivo', href: 'tv.html' },
          { texto: 'Jugar contra el profe', href: 'tablero.html' },
        ],
      });
    }

    const sostener = fuertes.length ? fuertes : ordenadas.slice(-2).map((a) => AREA_POR_ID[a.id]);
    semanas.push({
      numero: semanas.length + 1,
      area: 'cierre',
      titulo: `Semana ${semanas.length + 1} · 🎯 Juntar todo y volver a medir`,
      porque: fuertes.length
        ? `Lo más firme hoy es ${fuertes.map((f) => f.nombre.toLowerCase()).join(' y ')}: se mantiene con poco y sirve de apoyo para lo demás.`
        : 'Semana de consolidación: repasar lo trabajado antes de volver a medir.',
      objetivo: 'Repetir el diagnóstico y comparar área por área con esta medición.',
      tareas: [
        'Dos partidas largas (25 minutos o más) analizadas después con el profesor.',
        `Mantener con 10 minutos por sesión lo que ya está fuerte: ${sostener.map((f) => f.nombre.toLowerCase()).join(', ')}.`,
        'Repetir el diagnóstico completo y comparar el porcentaje de cada área.',
      ],
      recursos: [
        { texto: 'Repetir el diagnóstico', href: 'entreno/diagnostico.html' },
        { texto: 'Jugar contra el profe', href: 'tablero.html' },
      ],
    });

    // Meta de Elo para el ciclo: modesta si el Elo ya va por delante de la prueba,
    // más ambiciosa si la prueba muestra que hay margen sin explotar.
    let metaElo = null;
    if (elo.declarado) {
      const salto = elo.lectura && elo.lectura.clave === 'prueba_alta' ? 75 : elo.lectura && elo.lectura.clave === 'coherente' ? 50 : 30;
      metaElo = { actual: elo.declarado, meta: elo.declarado + salto, texto: `Elo ${elo.declarado} → ${elo.declarado + salto} en los próximos torneos (${elo.lectura ? elo.lectura.clave === 'prueba_alta' ? 'la prueba muestra margen sin explotar' : elo.lectura.clave === 'coherente' ? 'avance sostenido' : 'primero cerrar los huecos que la prueba señala' : ''}).` };
    }

    return {
      nivel: resumen.nivel,
      porcentaje: resumen.porcentaje,
      elo: elo.declarado ? { declarado: elo.declarado, tipo: elo.tipo, estimado: elo.estimado, combinado: elo.combinado, lectura: elo.lectura.texto } : null,
      metaElo,
      rutina: RUTINA[resumen.nivel.clave] || RUTINA[resumen.nivel.clave === 'maestro' ? 'experto' : 'principiante'],
      prioridad: focos.length ? focos.map((f) => f.nombre) : ['Jugar y analizar: no hay área por debajo del 85%'],
      fortalezas: fuertes.map((f) => ({ nombre: f.nombre, emoji: f.emoji, nota: f.solido })),
      semanas,
      medicion: 'Volver a hacer el diagnóstico en cuatro semanas. Sube el porcentaje del área trabajada o se cambia el método, no el alumno.',
    };
  }

  // Los enlaces del plan se guardan relativos a la raíz del sitio; las páginas
  // que viven en una carpeta (entreno/) les anteponen su prefijo.
  function enlace(href, base) { return (base || '') + href; }

  return { AREAS, AREA_POR_ID, NIVELES, ESCALONES, nivelDe, nivelPorEscalones, porEscalon, resumir, generarPlan, enlace,
           ESCALON_ELO, escalonDeElo, azarDe, probabilidad, medir, combinar, notaDeArea, BANDAS_AREA, bandaDeNota,
           ELO_TIPOS, ELO_TIPO_POR_ID, ELO_MIN, ELO_MAX, nivelDeElo, eloDeNivel, eloEstimado, eloValido, lecturaElo };
})();
