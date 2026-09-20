/* ===== De dónde salen las preguntas de un examen =====
 *
 * Un examen se arma con preguntas que YA existen y YA están verificadas.
 * No se inventa ninguna, que es la regla de este repositorio desde la
 * "Lucena" que no era Lucena: las posiciones salen de bancos que se
 * comprobaron con chess.js y con motor.
 *
 * Tres bancos, y cada uno trae de fábrica lo que un examen necesita:
 *
 *  - `js/diagnostico-items.js` — 301 preguntas en 9 áreas, con `peso` de
 *    1 a 5 (que ES la dificultad, y por eso es lo que vale cada pregunta)
 *    y cuatro tipos: opción, opción con tablero, jugada y casilla. De
 *    acá salen las preguntas "sobre un tema de un curso": cada curso
 *    apunta a sus áreas en AREAS_DEL_CURSO.
 *  - `js/arbitraje-items.js` — 200 preguntas de reglamento, con su
 *    escalón y su cita del Handbook.
 *  - `js/aperturas-lineas.js` — 40 líneas, para "ejecuta esta apertura
 *    de una vez", sin pistas y sin deshacer.
 *
 * LO QUE ESTE ARCHIVO SEPARA, y es su razón de ser: cada pregunta se
 * parte en `visible` (lo que el alumno ve) y `clave` (la respuesta). La
 * clave viaja a `examen_items.clave`, una columna que el alumno no
 * puede leer — su examen se lo sirve `examen_para_alumno()`, que elige
 * columna por columna. Si `visible` se llevara la respuesta por
 * descuido, no fallaría nada: el examen se vería igual y se podría
 * aprobar mirando el código.
 *
 * Las opciones se barajan ACÁ, al armar el examen, y la clave guarda el
 * índice ya barajado. Así dos alumnos reciben el mismo examen con las
 * opciones en otro orden, y el número que queda guardado no dice nada
 * por sí solo.
 */
window.ExamenBanco = (function () {
  "use strict";

  /* Qué áreas del banco cubren cada curso. Es una decisión editorial y
     por eso está escrita, no deducida: el mismo criterio que
     AREA_DEL_CURSO de herramientas/curso-material.js, pero contra las
     nueve áreas del diagnóstico, que son las que tienen preguntas.
     Un curso que no esté acá no se puede examinar por curso — y se
     dice, en vez de devolver cero preguntas en silencio. */
  const AREAS_DEL_CURSO = {
    "fundamentos-del-ajedrez": ["reglas", "material"],
    "aperturas-y-defensas": ["apertura"],
    "calculo-y-visualizacion": ["calculo", "tactica"],
    "finales-practicos": ["finales"],
    "partidas-modelo": ["estrategia"],
    "estrategia-y-tactica": ["estrategia", "tactica"],
    "el-mapa-de-los-finales": ["finales"],
    "estrategia-en-el-final": ["finales", "estrategia"],
    "desequilibrios-de-material": ["material", "estrategia"],
    "preparacion-para-torneos": ["maestria", "calculo"],
  };

  /* Un sorteo que se puede repetir: con la misma semilla sale el mismo
     examen. Sirve para poder rearmar el examen de alguien y para que la
     comprobación no dependa del azar. */
  function azar(semilla) {
    let s = semilla >>> 0 || 1;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5;  s >>>= 0;
      return s / 4294967296;
    };
  }

  function barajar(lista, rnd) {
    const a = lista.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function items() {
    return (window.DIAGNOSTICO_ITEMS || []).slice();
  }

  function itemsArbitraje() {
    return (window.ARBITRAJE_ITEMS || []).slice();
  }

  function lineas() {
    const A = window.AperturasLineas;
    return (A && A.LINEAS) ? A.LINEAS.slice() : [];
  }

  /* ---------- Pasar una pregunta del banco al examen ---------- */

  /* Una de opción: se barajan las cuatro y la clave guarda dónde quedó
     la correcta DESPUÉS de barajar. `explica` va en `visible` porque el
     informe del profesor lo lee de ahí — pero examen_para_alumno() no
     devuelve `explica`, así que el alumno no lo ve mientras rinde. */
  function deOpcion(it, rnd) {
    const conIndice = it.opciones.map((texto, i) => ({ texto, i }));
    const mezcladas = barajar(conIndice, rnd);
    const correcta = mezcladas.findIndex((o) => o.i === it.correcta);
    return {
      tipo: it.fen ? "opcion_tablero" : "opcion",
      banco: "diagnostico",
      item_id: it.id,
      area: it.area,
      peso: it.peso,
      visible: {
        enunciado: it.enunciado,
        opciones: mezcladas.map((o) => o.texto),
        fen: it.fen || null,
        explica: it.explica || "",
      },
      // Texto y no número: en la base se compara con ->>'opcion', que
      // también es texto. Comparar un número con un texto en jsonb da
      // false siempre, y eso calificaría todo mal sin dar ningún error.
      clave: { correcta: String(correcta) },
    };
  }

  function deJugada(it) {
    const todas = [it.solucion].concat(it.alternas || []);
    return {
      tipo: "jugada",
      banco: "diagnostico",
      item_id: it.id,
      area: it.area,
      peso: it.peso,
      visible: { enunciado: it.enunciado, fen: it.fen, explica: it.explica || "" },
      // Todas las jugadas que valen, no solo la primera: dar una sola
      // marcaría mal una respuesta correcta.
      clave: { jugadas: todas.map((j) => ({ from: j.from, to: j.to })) },
    };
  }

  function deCasilla(it) {
    const todas = [it.solucion].concat(it.alternas || []);
    return {
      tipo: "casilla",
      banco: "diagnostico",
      item_id: it.id,
      area: it.area,
      peso: it.peso,
      visible: { enunciado: it.enunciado, fen: it.fen, explica: it.explica || "" },
      clave: { casillas: todas },
    };
  }

  function convertir(it, rnd) {
    if (it.tipo === "jugada") return deJugada(it);
    if (it.tipo === "casilla") return deCasilla(it);
    return deOpcion(it, rnd);
  }

  function deArbitraje(it, rnd) {
    const conIndice = it.opciones.map((texto, i) => ({ texto, i }));
    const mezcladas = barajar(conIndice, rnd);
    const correcta = mezcladas.findIndex((o) => o.i === it.correcta);
    return {
      tipo: "opcion",
      banco: "arbitraje",
      item_id: it.id,
      area: it.area,
      peso: it.peso || it.escalon || 1,
      visible: {
        enunciado: it.enunciado,
        opciones: mezcladas.map((o) => o.texto),
        fen: null,
        // La cita del Handbook es parte de la corrección, no del
        // enunciado: va donde va la explicación.
        explica: (it.explica || "") + (it.fuente ? " — Fuente: " + it.fuente : ""),
      },
      clave: { correcta: String(correcta) },
    };
  }

  /* Ejecutar una apertura: se le pide la línea entera de su color, de
     una vez. La dificultad sale del `nivel` de la línea y de cuántas
     jugadas le tocan — memorizar diez es más que memorizar cuatro. */
  function deLinea(linea) {
    const A = window.AperturasLineas;
    const mias = A && A.jugadasDelAlumno ? A.jugadasDelAlumno(linea) : [];
    const cuantas = mias.length || linea.jugadas.length;
    const peso = Math.max(1, Math.min(5, (linea.nivel || 1) + (cuantas >= 8 ? 2 : cuantas >= 5 ? 1 : 0)));
    return {
      tipo: "linea",
      banco: "aperturas",
      item_id: linea.id,
      area: "apertura",
      peso: peso,
      visible: {
        enunciado: "Ejecuta " + linea.nombre + (linea.apertura ? " (" + linea.apertura + ")" : "") +
          ". Juegas con " + (linea.color === "w" ? "blancas" : "negras") +
          ": da todas tus jugadas, sin pistas y sin deshacer.",
        linea_id: linea.id,
        color: linea.color,
        jugadas_rival: linea.jugadas,
        explica: linea.clave || linea.idea || "",
      },
      // La línea entera, en orden. O la da completa o no la da.
      clave: { jugadas: linea.jugadas },
    };
  }

  /* ---------- Armar el examen ---------- */

  /* Reparte `cantidad` preguntas entre los pesos pedidos lo más parejo
     posible, y si un peso no tiene suficientes tira del resto: un
     examen que pide 10 y devuelve 6 porque un escalón estaba flaco es
     peor que uno con la mezcla corrida. */
  function sortear(candidatos, cantidad, rnd) {
    const porPeso = new Map();
    candidatos.forEach((it) => {
      if (!porPeso.has(it.peso)) porPeso.set(it.peso, []);
      porPeso.get(it.peso).push(it);
    });
    const pesos = [...porPeso.keys()].sort((a, b) => a - b);
    pesos.forEach((p) => porPeso.set(p, barajar(porPeso.get(p), rnd)));

    const salida = [];
    let i = 0;
    while (salida.length < cantidad) {
      let sumo = false;
      for (const p of pesos) {
        if (salida.length >= cantidad) break;
        const lista = porPeso.get(p);
        if (lista.length) { salida.push(lista.shift()); sumo = true; }
      }
      if (!sumo) break;   // se acabaron las preguntas que cumplen
      if (++i > 1000) break;
    }
    return salida;
  }

  /* opciones:
       { fuente: 'curso' | 'areas' | 'arbitraje' | 'linea',
         curso, areas: [], linea_id, cantidad, dificultad: {min, max}, semilla } */
  function armar(op) {
    const rnd = azar(op.semilla || Math.floor(Math.random() * 1e9));
    const min = Math.max(1, (op.dificultad && op.dificultad.min) || 1);
    const max = Math.min(5, (op.dificultad && op.dificultad.max) || 5);
    const cantidad = Math.max(1, Math.min(100, op.cantidad || 10));

    if (op.fuente === "linea") {
      const l = lineas().find((x) => x.id === op.linea_id);
      if (!l) throw new Error("Esa línea de apertura ya no está en el banco.");
      return [deLinea(l)];
    }

    if (op.fuente === "arbitraje") {
      const cand = itemsArbitraje().filter((it) => {
        const p = it.peso || it.escalon || 1;
        return p >= min && p <= max && (!op.areas || !op.areas.length || op.areas.includes(it.area));
      });
      return sortear(cand, cantidad, rnd).map((it) => deArbitraje(it, rnd));
    }

    let areas = op.areas || [];
    if (op.fuente === "curso") {
      areas = AREAS_DEL_CURSO[op.curso] || [];
      if (!areas.length) {
        // Se dice, no se devuelve un examen vacío: un curso sin áreas
        // daría cero preguntas y el profesor no sabría por qué.
        throw new Error("De ese curso todavía no hay preguntas de examen.");
      }
    }

    const cand = items().filter((it) =>
      it.peso >= min && it.peso <= max && (!areas.length || areas.includes(it.area)));
    return sortear(cand, cantidad, rnd).map((it) => convertir(it, rnd));
  }

  /* Cuántas preguntas hay de verdad para lo que se está pidiendo. La
     pantalla lo usa para no dejar pedir 40 cuando hay 12: pedir más de
     las que existen daría un examen más corto sin decir por qué. */
  function disponibles(op) {
    const min = Math.max(1, (op.dificultad && op.dificultad.min) || 1);
    const max = Math.min(5, (op.dificultad && op.dificultad.max) || 5);
    if (op.fuente === "linea") return 1;
    if (op.fuente === "arbitraje") {
      return itemsArbitraje().filter((it) => {
        const p = it.peso || it.escalon || 1;
        return p >= min && p <= max && (!op.areas || !op.areas.length || op.areas.includes(it.area));
      }).length;
    }
    let areas = op.areas || [];
    if (op.fuente === "curso") areas = AREAS_DEL_CURSO[op.curso] || [];
    return items().filter((it) =>
      it.peso >= min && it.peso <= max && (!areas.length || areas.includes(it.area))).length;
  }

  function cursosConPreguntas() {
    return Object.keys(AREAS_DEL_CURSO);
  }

  /* ---------- Cuánto tiempo pedir ---------- */

  /* Cuánto lleva cada tipo de pregunta, en segundos y a dificultad media.
     No son números inventados al aire: salen de lo que hay que HACER en
     cada una. Leer un enunciado y elegir entre cuatro frases no es lo
     mismo que mirar una posición, y mirarla no es lo mismo que calcular
     la jugada que la resuelve. */
  const SEGUNDOS_BASE = {
    opcion: 60,          // se lee y se elige
    opcion_tablero: 90,  // + hay que leer la posición
    casilla: 75,         // mirar el tablero y señalar una casilla
    jugada: 120,         // hay que calcular, no reconocer
  };
  const SEGUNDOS_POR_JUGADA_DE_LINEA = 30;
  const MINIMO_DE_UNA_LINEA = 90;

  /* Que una pregunta de opción de dificultad media dé justo 60 s no es
     casualidad ni se puede bajar sin pensarlo: es el mismo minuto por
     pregunta que exige crear_examen(). Con bases más cortas el mínimo
     tapaba el cálculo casi siempre y el "recomendado" devolvía la
     cantidad de preguntas y nada más — o sea, no recomendaba nada, y se
     veía igual de bien en pantalla. */

  /* La dificultad estira o encoge ese rato, centrada en el peso 3: una
     de peso 1 se contesta en el 70 % del tiempo y una de peso 5 pide un
     30 % más. */
  function factorDePeso(peso) {
    const p = Math.max(1, Math.min(5, peso || 3));
    return 1 + 0.15 * (p - 3);
  }

  /* Cuántas jugadas le tocan DE VERDAD al alumno en esa línea. La línea
     guardada incluye las del rival, así que contarlas todas doblaría el
     tiempo. Se lee de AperturasLineas, que es donde vive esa cuenta. */
  function jugadasDelAlumnoDe(item) {
    const clave = (item.clave && item.clave.jugadas) || [];
    const l = lineas().find((x) => x.id === item.item_id);
    if (!l) return Math.max(1, Math.ceil(clave.length / 2));
    const A = window.AperturasLineas;
    const mias = A && A.jugadasDelAlumno ? A.jugadasDelAlumno(l) : [];
    return mias.length || Math.max(1, Math.ceil((l.jugadas || []).length / 2));
  }

  /* El tiempo que se le recomienda al profesor, calculado sobre las
     preguntas que de verdad le tocaron al examen — no sobre "cuántas
     pidió". Diez de opción fáciles y diez de jugada difíciles no duran
     lo mismo, y proponer el mismo número para las dos sería proponer
     cualquier cosa.

     El `Math.max` contra `minimo` NO es una precaución de más: es lo que
     impide que el sitio le proponga al profesor un número que su propio
     servidor va a rechazar. `crear_examen()` exige un minuto por
     pregunta, y diez preguntas de opción fáciles suman 5 minutos de
     cálculo — o sea que sin ese tope el botón fallaría con el número que
     la misma pantalla acababa de recomendar. */
  function minutosRecomendados(items) {
    const lista = items || [];
    const porTipo = {};
    let segundos = 0;
    lista.forEach((it) => {
      porTipo[it.tipo] = (porTipo[it.tipo] || 0) + 1;
      if (it.tipo === "linea") {
        // Acá NO se multiplica por el peso: el peso de una línea ya se
        // calcula a partir de cuántas jugadas tiene (ver deLinea), así
        // que aplicarlo otra vez sería contar lo mismo dos veces.
        segundos += Math.max(MINIMO_DE_UNA_LINEA,
          jugadasDelAlumnoDe(it) * SEGUNDOS_POR_JUGADA_DE_LINEA);
      } else {
        segundos += (SEGUNDOS_BASE[it.tipo] || SEGUNDOS_BASE.opcion) * factorDePeso(it.peso);
      }
    });
    const minimo = Math.max(1, lista.length);
    return {
      minutos: Math.max(minimo, Math.ceil(segundos / 60), 1),
      minimo: minimo,
      porTipo: porTipo,
    };
  }

  return { AREAS_DEL_CURSO, armar, disponibles, cursosConPreguntas, minutosRecomendados,
           _barajar: barajar, _azar: azar };
})();
