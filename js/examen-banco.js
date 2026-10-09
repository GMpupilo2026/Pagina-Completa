/* ===== De dónde salen las preguntas de un examen =====
 *
 * Un examen se arma con preguntas que YA existen y YA están verificadas.
 * No se inventa ninguna, que es la regla de este repositorio desde la
 * "Lucena" que no era Lucena: las posiciones salen de bancos que se
 * comprobaron con chess.js y con motor.
 *
 * Cuatro bancos, y cada uno trae de fábrica lo que un examen necesita:
 *
 *  - El banco del diagnóstico (centenares de preguntas en 9 áreas) — de acá salen
 *    las preguntas "sobre un tema de un curso": cada curso apunta a sus
 *    áreas en AREAS_DEL_CURSO. Ya no viaja al navegador (ver «Diagnóstico»
 *    en docs/decisiones/entrenamiento.md): `items()` lee el catálogo
 *    público y SIN respuestas de `js/diagnostico-catalogo.js` —alcanza
 *    para sortear y para la previsión de tiempo, que solo necesitan
 *    `área`, `peso` y `tipo`— y el contenido de verdad (enunciado,
 *    opciones, clave) lo entrega `diagnostico_items_para_examen()` por
 *    las pocas preguntas que de verdad se van a usar, recién al poner el
 *    examen (`completar()`, abajo). `js/diagnostico-items.js` —el banco
 *    entero, con las respuestas— no se publica.
 *  - `js/arbitraje-items.js` — 200 preguntas de reglamento, con su
 *    escalón y su cita del Handbook.
 *  - `js/aperturas-lineas.js` — 40 líneas, para "ejecuta esta apertura
 *    de una vez", sin pistas y sin deshacer.
 *  - `material/ponte-a-prueba/banco.js` — las 180 posiciones del libro «Ponte a
 *    prueba», en seis pruebas de 30, comprobadas con Stockfish. Cada una
 *    trae dos preguntas (cómo queda y cuál es la jugada) con crédito
 *    parcial para el papel; acá se toma la de la jugada, que es la que
 *    tiene una sola respuesta buena.
 *
 * Estos tres últimos SÍ viajan enteros al navegador de quien da clase,
 * con su respuesta: es la misma fuga que tenía el diagnóstico, pendiente
 * para otra vez.
 *
 * LO QUE ESTE ARCHIVO SEPARA, y es su razón de ser: cada pregunta se
 * parte en `visible` (lo que el alumno ve) y `clave` (la respuesta). La
 * clave viaja a `examen_items.clave`, una columna que el alumno no
 * puede leer — su examen se lo sirve `examen_para_alumno()`, que elige
 * columna por columna. Si `visible` se llevara la respuesta por
 * descuido, no fallaría nada: el examen se vería igual y se podría
 * aprobar mirando el código.
 *
 * Las opciones se barajan al armar el examen (acá para arbitraje/libro,
 * en diagnostico_items_para_examen() para el diagnóstico), y la clave
 * guarda el índice ya barajado. Así dos alumnos reciben el mismo examen
 * con las opciones en otro orden, y el número que queda guardado no dice
 * nada por sí solo.
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
    "rompe-el-estancamiento": ["estrategia", "calculo", "tactica"],
    "ganar-con-poco": ["estrategia", "finales"],
    "cambiar-o-no-cambiar": ["estrategia", "material"],
    "ideas-que-ganan-partidas": ["estrategia", "tactica", "finales"],
    "los-cimientos-del-ajedrez": ["tactica", "finales", "estrategia", "calculo", "apertura"],
    "una-clase-al-dia": ["estrategia", "tactica", "finales"],
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

  /* El catálogo público —solo id, área, peso y tipo, sin enunciado ni
     respuesta— alcanza para sortear cuáles preguntas tocan y para calcular
     cuántas hay y cuánto tiempo piden (minutosRecomendados solo mira `tipo` y
     `peso`). El contenido de verdad lo entrega el servidor, y solo para las
     pocas que de verdad se van a usar: ver completar(), más abajo. */
  function items() {
    return (window.DIAGNOSTICO_CATALOGO || []).slice();
  }

  function itemsArbitraje() {
    return (window.ARBITRAJE_ITEMS || []).slice();
  }

  function itemsLibro() {
    return (window.LIBRO_EXAMEN_ITEMS || []).slice();
  }

  function lineas() {
    const A = window.AperturasLineas;
    return (A && A.LINEAS) ? A.LINEAS.slice() : [];
  }

  /* ---------- Pasar una pregunta del banco al examen ---------- */

  /* Las preguntas del diagnóstico que ya se sortearon (por item_id) con su
     contenido real y su clave, listas para crear_examen() — exactamente el
     mismo formato que armaban antes deOpcion/deJugada/deCasilla, ahora
     construido en el servidor (diagnostico_items_para_examen) para que su
     respuesta no pase por este navegador. Se llama una sola vez, al poner el
     examen: ver completar(), más abajo. */

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

  /* Una posición del libro «Ponte a prueba»: la pregunta de la jugada, con
     sus cuatro opciones barajadas. En el libro una opción mala resta y una
     aceptable suma 1; el examen de la plataforma califica bien o mal, así
     que acá vale la buena y nada más. */
  function deLibro(it, rnd) {
    const conIndice = it.jugada.opciones.map((texto, i) => ({ texto, i }));
    const mezcladas = barajar(conIndice, rnd);
    const correcta = mezcladas.findIndex((o) => o.i === it.jugada.correcta);
    return {
      tipo: "opcion_tablero",
      banco: "libro",
      item_id: it.id,
      area: it.grupo,
      peso: it.peso,
      visible: {
        enunciado: "Las negras acaban de jugar …" + it.ultima + ". Juegan las blancas: ¿cuál es la mejor jugada?",
        opciones: mezcladas.map((o) => o.texto),
        fen: it.fen,
        explica: it.explica || "",
      },
      clave: { correcta: String(correcta) },
    };
  }

  function candidatosLibro(op, min, max) {
    const prueba = parseInt(op.prueba, 10) || 0;
    return itemsLibro().filter((it) =>
      it.peso >= min && it.peso <= max && (!prueba || it.prueba === prueba));
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
       { fuente: 'curso' | 'areas' | 'arbitraje' | 'linea' | 'libro',
         curso, areas: [], linea_id, prueba, cantidad, dificultad: {min, max}, semilla }
     `prueba` (1 a 6) es solo del libro; vacía, las seis. */
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

    if (op.fuente === "libro") {
      return sortear(candidatosLibro(op, min, max), cantidad, rnd).map((it) => deLibro(it, rnd));
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
    // Todavía sin `visible`/`clave`: eso lo entrega el servidor, y solo para
    // estas pocas (completar(), más abajo) — nunca el banco entero.
    return sortear(cand, cantidad, rnd).map((it) => ({
      tipo: it.tipo, banco: "diagnostico", item_id: it.id, area: it.area, peso: it.peso,
    }));
  }

  /* De las preguntas que armar() devolvió, completa con su contenido real y
     su clave las que todavía no lo tienen —las del diagnóstico, sorteadas
     sobre el catálogo sin respuestas—. Arbitraje, apertura y libro ya las
     traen completas desde armar(), así que no se tocan. Se llama una sola
     vez, al poner el examen: resortear acá mandaría un examen distinto del
     que se le mostró al profesor (ver el comentario de refrescarPrevision()
     en js/examenes.js). */
  async function completar(items) {
    const faltan = items.filter((it) => it.banco === "diagnostico" && !it.visible);
    if (!faltan.length) return items;
    const ids = faltan.map((it) => it.item_id);
    const { data, error } = await sb.rpc("diagnostico_items_para_examen", { p_ids: ids });
    if (error) throw new Error(error.message);
    const porId = {};
    (data || []).forEach((it) => { porId[it.item_id] = it; });
    return items.map((it) => {
      if (it.banco !== "diagnostico" || it.visible) return it;
      const it2 = porId[it.item_id];
      if (!it2) throw new Error("Una pregunta del banco ya no está disponible: vuelve a armar el examen.");
      return it2;
    });
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
    if (op.fuente === "libro") return candidatosLibro(op, min, max).length;
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

  return { AREAS_DEL_CURSO, armar, completar, disponibles, cursosConPreguntas, minutosRecomendados,
           _barajar: barajar, _azar: azar };
})();
