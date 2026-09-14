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
 * Sobre el nivel estimado: sale del porcentaje ponderado de la prueba (cada
 * ítem pesa 1, 2 o 3 según su dificultad). Es una estimación de trabajo para
 * ubicar al alumno y orientar el plan — no es un rating oficial ni sustituye a
 * los resultados de torneo, y así se dice en pantalla.
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
        { texto: 'Aprende — Movimientos y Reglas especiales', href: 'entreno/aprender.html' },
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
        { texto: 'Entreno 4×4', href: 'entreno/4x4.html' },
        { texto: 'Curso: Fundamentos del Ajedrez', href: 'cursos/fundamentos-del-ajedrez.html' },
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
        { texto: 'Entreno — Táctica por temas', href: 'entreno/temas.html' },
        { texto: 'Racha táctica', href: 'racha-tactica.html' },
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
        { texto: 'Entreno — Mates', href: 'entreno/mates.html' },
        { texto: 'Practicar contra el motor', href: 'entreno/practicas.html' },
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
        { texto: 'Curso: Los 100 finales que hay que conocer', href: 'cursos/los-100-finales.html' },
        { texto: 'Curso: Finales Prácticos', href: 'cursos/finales-practicos.html' },
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
        { texto: 'Curso: Cálculo y Visualización', href: 'cursos/calculo-y-visualizacion.html' },
        { texto: 'Entreno — Coordenadas', href: 'entreno/coordenadas.html' },
        { texto: 'Juego de Concentración', href: 'concentracion.html' },
      ],
    },
  ];

  const AREA_POR_ID = {};
  AREAS.forEach((a) => { AREA_POR_ID[a.id] = a; });

  // Tramos de nivel. El rango de fuerza es orientativo y así se muestra siempre:
  // ubica al alumno para elegir material, no certifica un rating.
  const NIVELES = [
    { clave: 'iniciacion',  desde: 0,  etiqueta: 'Iniciación',   rango: 'menos de 800 aprox.',
      descripcion: 'Está aprendiendo las reglas y a no dejar piezas. El objetivo de estas semanas es jugar sin errores de reglamento y contar bien el material.' },
    { clave: 'principiante', desde: 30, etiqueta: 'Principiante', rango: '800 a 1100 aprox.',
      descripcion: 'Ya juega partidas completas. Toca asentar la táctica básica y los mates elementales: es lo que decide sus partidas hoy.' },
    { clave: 'intermedio',   desde: 50, etiqueta: 'Intermedio',   rango: '1100 a 1400 aprox.',
      descripcion: 'Tiene base. Ahora los puntos se ganan con finales, planes y cálculo ordenado, más que con nuevas aperturas.' },
    { clave: 'avanzado',     desde: 70, etiqueta: 'Avanzado',     rango: '1400 a 1700 aprox.',
      descripcion: 'Juega bien en general. Conviene trabajar por debilidades concretas y preparar torneos con partidas largas analizadas.' },
    { clave: 'competitivo',  desde: 85, etiqueta: 'Competitivo',  rango: '1700 o más aprox.',
      descripcion: 'Nivel de competencia. El plan debe apuntar a repertorio propio, finales técnicos y análisis sistemático de las partidas.' },
  ];

  function nivelDe(porcentaje) {
    let nivel = NIVELES[0];
    NIVELES.forEach((n) => { if (porcentaje >= n.desde) nivel = n; });
    return nivel;
  }

  /* Convierte el detalle guardado del diagnóstico en algo legible.
     `detalle` es lo que escribe entreno/diagnostico.html en training_progress:
     { version, perfil, areas: { <areaId>: { peso, logrado, aciertos, total } }, ... } */
  function resumir(detalle) {
    const areas = (detalle && detalle.areas) || {};
    const porArea = AREAS.map((a) => {
      const d = areas[a.id] || { peso: 0, logrado: 0, aciertos: 0, total: 0 };
      const porcentaje = d.peso ? Math.round((d.logrado / d.peso) * 100) : 0;
      return {
        id: a.id, nombre: a.nombre, emoji: a.emoji, mide: a.mide,
        porcentaje, aciertos: d.aciertos || 0, total: d.total || 0,
      };
    });
    const pesoTotal = porArea.reduce((s, a) => s + (areas[a.id] ? areas[a.id].peso : 0), 0);
    const logradoTotal = porArea.reduce((s, a) => s + (areas[a.id] ? areas[a.id].logrado : 0), 0);
    const porcentaje = pesoTotal ? Math.round((logradoTotal / pesoTotal) * 100) : 0;
    const ordenadas = porArea.slice().sort((a, b) => a.porcentaje - b.porcentaje);
    return {
      porArea,
      porcentaje,
      nivel: nivelDe(porcentaje),
      aciertos: porArea.reduce((s, a) => s + a.aciertos, 0),
      total: porArea.reduce((s, a) => s + a.total, 0),
      debilidades: ordenadas.filter((a) => a.porcentaje < 60).slice(0, 3),
      fortalezas: ordenadas.slice().reverse().filter((a) => a.porcentaje >= 80),
      perfil: (detalle && detalle.perfil) || {},
      fecha: (detalle && detalle.fecha) || null,
    };
  }

  // Minutos diarios sugeridos según el nivel: ni pedirle una hora a quien recién
  // empieza, ni quedarse corto con quien ya compite.
  const RUTINA = {
    iniciacion: '15 minutos al día, 4 días por semana',
    principiante: '20 minutos al día, 5 días por semana',
    intermedio: '30 minutos al día, 5 días por semana',
    avanzado: '40 minutos al día, 5 días por semana',
    competitivo: '1 hora al día, 6 días por semana',
  };

  /* Plan de cuatro semanas. La regla pedagógica: una sola área por semana (dos
     focos a la vez no se sostienen), las más flojas primero porque son las que
     más puntos devuelven, y la última semana para juntar todo y volver a medir.
     Si no hay debilidades claras, el plan se ordena igual por las áreas más
     bajas: siempre hay una que va última. */
  function generarPlan(resumen) {
    const ordenadas = resumen.porArea.slice().sort((a, b) => a.porcentaje - b.porcentaje);
    // Solo entran al plan las áreas que de verdad tienen margen: dedicarle una
    // semana a algo que ya está al 100% es tiempo que no se le da a lo flojo.
    const candidatas = ordenadas.filter((a) => a.porcentaje < 85);
    const focos = candidatas.slice(0, 3).map((a) => AREA_POR_ID[a.id]);
    const fuertes = resumen.fortalezas.map((a) => AREA_POR_ID[a.id]);

    const semanas = focos.map((area, i) => {
      const dato = resumen.porArea.find((p) => p.id === area.id);
      return {
        numero: i + 1,
        area: area.id,
        titulo: `Semana ${i + 1} · ${area.emoji} ${area.nombre}`,
        porque: dato.porcentaje < 60
          ? `${dato.porcentaje}% en el diagnóstico. ${area.flojo}`
          : `${dato.porcentaje}% en el diagnóstico: es de lo más bajo que tiene, y afinarlo sostiene todo lo demás.`,
        objetivo: `Subir ${area.nombre.toLowerCase()} por encima del ${Math.min(95, Math.max(70, dato.porcentaje + 20))}% en la próxima medición.`,
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

    return {
      nivel: resumen.nivel,
      porcentaje: resumen.porcentaje,
      rutina: RUTINA[resumen.nivel.clave] || RUTINA.principiante,
      prioridad: focos.length ? focos.map((f) => f.nombre) : ['Jugar y analizar: no hay área por debajo del 85%'],
      fortalezas: fuertes.map((f) => ({ nombre: f.nombre, emoji: f.emoji, nota: f.solido })),
      semanas,
      medicion: 'Volver a hacer el diagnóstico en cuatro semanas. Sube el porcentaje del área trabajada o se cambia el método, no el alumno.',
    };
  }

  // Los enlaces del plan se guardan relativos a la raíz del sitio; las páginas
  // que viven en una carpeta (entreno/) les anteponen su prefijo.
  function enlace(href, base) { return (base || '') + href; }

  return { AREAS, AREA_POR_ID, NIVELES, nivelDe, resumir, generarPlan, enlace };
})();
