/* ===== Ajedrez Integral — Criterio del examen de arbitraje =====
 *
 * Qué mide cada área, cómo se estima el nivel y qué estudiar después. Lo usa
 * arbitraje.html (la herramienta de profesores y administración) y está
 * separado del banco de preguntas a propósito: el criterio se discute y se
 * ajusta sin tocar los ítems.
 *
 * El nivel NO sale del porcentaje, sale de hasta qué escalón de dificultad
 * llega quien rinde. Un examen de arbitraje con preguntas fáciles de sobra
 * infla a cualquiera que conozca las Leyes básicas; lo que distingue a un
 * árbitro FIDE de uno de club son las preguntas de escalón 4 y 5, y por eso el
 * nivel se decide ahí. Además, un área en blanco pone techo: nadie dirige un
 * torneo internacional sin saber el reglamento del reloj, por muy bien que
 * conteste el resto.
 *
 * Y una aclaración que la herramienta repite en pantalla: esto mide
 * CONOCIMIENTO DEL REGLAMENTO. Los títulos de árbitro los otorga la FIDE con
 * seminarios, normas y licencia (B.06); este examen no los reemplaza ni los
 * anticipa: sirve para saber por dónde se está y qué falta estudiar.
 */
window.ArbitrajeNivel = (function () {
  "use strict";

  const AREAS = [
    {
      id: 'leyes', nombre: 'Leyes del Ajedrez', emoji: '📖',
      mide: 'La partida y el acto de mover: jugada completada, pieza tocada, enroque, coronación, mate y ahogado.',
      flojo: 'Es la base de todo lo demás: sin esto firme, cualquier reclamación en la sala se resuelve por intuición.',
      estudiar: 'Leyes del Ajedrez, artículos 1 a 5, leídos completos y seguidos.',
    },
    {
      id: 'reloj', nombre: 'El reloj y el tiempo', emoji: '⏱️',
      mide: 'Puesta en marcha, incrementos, caída de bandera, relojes defectuosos e incomparecencia.',
      flojo: 'Las decisiones de reloj son las más frecuentes y las más discutidas de un torneo.',
      estudiar: 'Leyes del Ajedrez, artículo 6 completo, con atención al 6.7 (incomparecencia) y al 6.9 (bandera).',
    },
    {
      id: 'irregularidades', nombre: 'Jugadas ilegales', emoji: '⚠️',
      mide: 'Jugadas ilegales, cuándo quedan completadas, posiciones y colores incorrectos, reposición de la posición.',
      flojo: 'Es donde más se equivoca un árbitro nuevo: sanciona de más, de menos, o fuera de tiempo.',
      estudiar: 'Leyes del Ajedrez, artículo 7 completo, y el 7.5 memorizado.',
    },
    {
      id: 'tablas', nombre: 'Planilla y tablas', emoji: '🤝',
      mide: 'Obligación de anotar, ofertas de tablas y las reclamaciones por repetición y por 50 jugadas.',
      flojo: 'Una reclamación mal resuelta cambia el resultado de la partida y casi siempre termina en apelación.',
      estudiar: 'Leyes del Ajedrez, artículos 8 y 9, con el procedimiento del 9.2 paso a paso.',
    },
    {
      id: 'conducta', nombre: 'Conducta y sanciones', emoji: '🚦',
      mide: 'Dispositivos electrónicos, ayuda externa, molestias al rival, la escala de sanciones y el papel del árbitro.',
      flojo: 'Sancionar de más rompe el torneo y sancionar de menos lo deja sin reglas: el equilibrio se aprende con la escala del 12.9.',
      estudiar: 'Leyes del Ajedrez, artículos 11 y 12, y el protocolo antitrampa de la FIDE.',
    },
    {
      id: 'ritmos', nombre: 'Rápidas y relámpago', emoji: '⚡',
      mide: 'Definición de cada ritmo y las reglas propias de los apéndices: ilegales, anotación, reclamaciones, supervisión.',
      flojo: 'Aplicar en relámpago el criterio del clásico (o al revés) es el error más común en torneos de fin de semana.',
      estudiar: 'Leyes del Ajedrez, apéndices A y B, con los cambios de 2023 (un minuto también en rápidas).',
    },
    {
      id: 'competicion', nombre: 'Emparejamientos y desempates', emoji: '🗂️',
      mide: 'Sistema suizo, colores, byes, desempates y el trabajo de sala antes y después de la ronda.',
      flojo: 'Un emparejamiento mal hecho o un desempate improvisado se nota en la tabla y no se puede deshacer.',
      estudiar: 'Reglas de emparejamiento C.04 y de desempates C.07, más práctica con un programa homologado.',
    },
    {
      id: 'titulos', nombre: 'Oficio del árbitro', emoji: '⚖️',
      mide: 'Deberes, títulos y categorías, licencia, informes, conflictos de interés y comité de apelación.',
      flojo: 'Es la parte que no se ve en la sala y sostiene todo lo demás: sin informe y sin licencia, el torneo no existe para la FIDE.',
      estudiar: 'Handbook B.06 (títulos, formación y clasificación de árbitros) y el manual del árbitro.',
    },
  ];
  const AREA_POR_ID = {};
  AREAS.forEach((a) => { AREA_POR_ID[a.id] = a; });

  /* `escalon` es el peso de pregunta que hay que superar para llegar a este
     nivel. El rango de título es orientativo: dice a qué examen se parece lo
     que la persona demostró, no que tenga (ni vaya a tener) ese título. */
  const NIVELES = [
    { clave: 'formacion', escalon: 0, etiqueta: 'En formación', referencia: 'todavía no',
      descripcion: 'Faltan las bases del reglamento. Antes de dirigir una ronda hay que leer las Leyes completas, de principio a fin, y volver a rendir.' },
    { clave: 'auxiliar', escalon: 1, etiqueta: 'Auxiliar de sala', referencia: 'apoyo con supervisión',
      descripcion: 'Alcanza para acompañar una sala con un árbitro responsable al lado: controlar planillas, relojes y resultados, sin resolver reclamaciones.' },
    { clave: 'club', escalon: 2, etiqueta: 'Árbitro de club', referencia: 'torneos escolares y de club',
      descripcion: 'Puede dirigir un torneo interno o escolar. Lo que falta es lo que aparece cuando el torneo se complica: reclamaciones, ritmos y emparejamientos.' },
    { clave: 'nacional', escalon: 3, etiqueta: 'Nivel de Árbitro Nacional', referencia: 'examen de NA',
      descripcion: 'El conocimiento alcanza el nivel que suele pedir un examen de árbitro nacional. El paso siguiente es el seminario de la FIDE y la práctica en torneos válidos para rating.' },
    { clave: 'fide', escalon: 4, etiqueta: 'Nivel de Árbitro FIDE', referencia: 'examen de FA',
      descripcion: 'Domina las Leyes y su aplicación fina. Para el título hacen falta el seminario con examen, las normas y la licencia: este resultado dice que el contenido está.' },
    { clave: 'internacional', escalon: 5, etiqueta: 'Nivel de Árbitro Internacional', referencia: 'examen de IA',
      descripcion: 'Resuelve también los casos raros y la parte de organización. Para el título, el camino es el del Handbook B.06: FA primero, normas en torneos distintos y edad mínima.' },
  ];

  const ESCALONES = [1, 2, 3, 4, 5];
  const UMBRAL = 0.7;   // 70% de aciertos para dar un escalón por superado

  /* El umbral es más alto que en el diagnóstico de jugadores (70% contra 60%)
     a propósito: en un examen de arbitraje, "más o menos" no sirve — una regla
     a medias aplicada en la sala es una decisión equivocada. */

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

  function escalonAlcanzado(escalones) {
    for (let i = escalones.length - 1; i >= 0; i--) {
      const e = escalones[i];
      if (!e.total || e.porcentaje === null) continue;
      const hasta = escalones.slice(0, i + 1).filter((x) => x.total > 0);
      const promedio = hasta.reduce((s, x) => s + x.porcentaje, 0) / hasta.length;
      if (e.porcentaje >= UMBRAL * 100 && promedio >= UMBRAL * 100) return e.peso;
    }
    return 0;
  }

  /* Un área floja pone techo: no se puede dirigir a nivel internacional con un
     capítulo del reglamento en blanco. */
  function topePorAreas(porArea) {
    if (!porArea || !porArea.length) return NIVELES.length - 1;
    const minima = Math.min.apply(null, porArea.map((a) => a.porcentaje));
    if (minima < 40) return 2;    // como mucho, árbitro de club
    if (minima < 60) return 3;    // como mucho, nivel nacional
    return NIVELES.length - 1;
  }

  function resumir(detalle) {
    const areas = (detalle && detalle.areas) || {};
    const porArea = AREAS.map((a) => {
      const d = areas[a.id] || { peso: 0, logrado: 0, aciertos: 0, total: 0, nosabe: 0 };
      return {
        id: a.id, nombre: a.nombre, emoji: a.emoji, mide: a.mide, flojo: a.flojo, estudiar: a.estudiar,
        porcentaje: d.peso ? Math.round((d.logrado / d.peso) * 100) : 0,
        aciertos: d.aciertos || 0, total: d.total || 0, nosabe: d.nosabe || 0,
      };
    });
    const pesoTotal = porArea.reduce((s, a) => s + (areas[a.id] ? areas[a.id].peso : 0), 0);
    const logradoTotal = porArea.reduce((s, a) => s + (areas[a.id] ? areas[a.id].logrado : 0), 0);
    const porcentaje = pesoTotal ? Math.round((logradoTotal / pesoTotal) * 100) : 0;
    const escalones = porEscalon(detalle && detalle.dificultad);
    const tope = topePorAreas(porArea);
    const alcanzado = Math.min(escalonAlcanzado(escalones), tope);
    const ordenadas = porArea.slice().sort((a, b) => a.porcentaje - b.porcentaje);
    return {
      porArea, porcentaje, escalones, escalonAlcanzado: alcanzado, topeAreas: tope,
      nivel: NIVELES[alcanzado],
      aciertos: porArea.reduce((s, a) => s + a.aciertos, 0),
      total: porArea.reduce((s, a) => s + a.total, 0),
      nosabe: porArea.reduce((s, a) => s + a.nosabe, 0),
      aReforzar: ordenadas.filter((a) => a.porcentaje < 70).slice(0, 3),
      firmes: ordenadas.slice().reverse().filter((a) => a.porcentaje >= 85),
      fecha: (detalle && detalle.fecha) || null,
    };
  }

  return { AREAS, AREA_POR_ID, NIVELES, ESCALONES, UMBRAL, porEscalon, resumir };
})();
