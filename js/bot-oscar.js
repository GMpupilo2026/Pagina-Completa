/* ===== El bot de Oscar =====
 *
 * Un rival de práctica para TODAS las modalidades de Juegos, no solo para el
 * ajedrez normal. No sabe de aperturas ni de finales: mira la posición, prueba
 * las jugadas legales y elige. Lo que lo hace servir para cualquier variante es
 * que no conoce las reglas: se las pregunta a un adaptador.
 *
 *   BotOscar.jugar(adaptador, nivel) → la jugada elegida (o null si no hay)
 *
 * El adaptador es lo único que hay que escribir por modalidad (están en
 * bot.html) y tiene cuatro cosas:
 *
 *   turno()          "w" | "b"
 *   jugadas()        lista de jugadas legales del bando en turno (objetos opacos)
 *   probar(jugada)   devuelve OTRO adaptador con esa jugada hecha, sin tocar el
 *                    original; null si por lo que sea no se puede simular
 *   material()       cuánto vale la posición para las blancas, en peones
 *
 * y dos opcionales, que si faltan no rompen nada:
 *
 *   enJaque()        para distinguir el mate del ahogado (ver valorSinJugadas)
 *   valorJugada(j)   qué promete una jugada SIN jugarla — ver «El orden» abajo
 *
 * `material()` no es solo material a secas — en bot.html incluye tablas de
 * posición, fase de partida y (en Crazyhouse) lo que hay en la reserva —, pero
 * este archivo no necesita saberlo: para el bot sigue siendo "un número, más
 * alto mejor para blancas".
 *
 * Con eso alcanza para cuatro niveles:
 *
 *   1 Aprendiz — juega al azar, con un empujón hacia las capturas. Para quien
 *                está aprendiendo a mover: pierde piezas y deja ganar.
 *   2 Club     — mira una jugada adelante y se queda con la mejor, pero además
 *                comprueba la respuesta del rival: así no regala piezas por
 *                tomar un peón.
 *   3 Avanzado — poda alfa-beta a 3 jugadas completas, ordenando las jugadas
 *                de mejor a peor antes de explorarlas para que la poda corte
 *                de verdad (si no, se prueban en el orden que las devuelve el
 *                motor, que no dice nada de cuáles convienen).
 *   4 Maestro  — el techo: profundización iterativa (1, 2, 3… jugadas, cada
 *                vez más a fondo) con un presupuesto de tiempo en vez de una
 *                profundidad fija, así que en una posición simple llega más
 *                lejos y en una complicada no se cuelga. Es el mismo buscador
 *                que el nivel 3, con más tiempo y más profundidad.
 *
 * Por qué no Stockfish: solo sabría jugar el ajedrez normal. Un bot que entiende
 * abrazos, camaleón, crazyhouse y cartas vale más acá que uno fortísimo en una
 * sola modalidad.
 *
 * ---------------------------------------------------------------------------
 * EL ORDEN DE LAS JUGADAS ES CASI TODO EL COSTO, Y NO SE VE
 *
 * `probar()` es lo caro de este bot y no se parece en nada a "hacer una
 * jugada": cada adaptador se CLONA desde su posición serializada (chess.js
 * vuelve a leer una FEN entera, Cartas rehace su JSON), así que una sola
 * llamada cuesta unas mil veces más que evaluar la posición ya hecha. Medido
 * en un mediojuego normal: `probar()` ~123 µs, `material()` ~7 µs.
 *
 * Antes, para ordenar las jugadas de un nodo se hacía `probar()` sobre TODAS
 * —cuarenta clones— solo para poder mirar el `material()` de cada una y
 * ponerlas de mejor a peor. Después la poda alfa-beta hacía su trabajo y se
 * exploraban dos o tres. O sea: **el 97% de los clones se construían para
 * tirarlos**, y se tiraban DESPUÉS de haberlos pagado — la poda no podía
 * ahorrar nada, porque el trabajo ya estaba hecho antes de entrar al bucle.
 * Eso no da ningún error: el bot juega igual de bien, solo que con el
 * presupuesto de tiempo gastado en clonar posiciones que nadie iba a mirar, y
 * con cuarenta posiciones vivas a la vez en cada nivel de la búsqueda.
 *
 * Ahora el orden se decide **sin jugar nada**, con `valorJugada(j)` —lo que la
 * jugada promete mirando la pieza que se mueve y la que hay en la casilla de
 * destino, que el adaptador sabe leer de su propio tablero— y `probar()` se
 * paga **una por una, solo al entrar en la rama**. Así el corte de la poda
 * deja de ser cosmético: lo que no se explora tampoco se clona.
 *
 * `valorJugada` es opcional a propósito. Un adaptador que no la tenga vuelve
 * solo al orden de antes (clonar todas y mirar el material): más lento, pero
 * idéntico a lo que ya hacía — nunca peor.
 * ---------------------------------------------------------------------------
 */
window.BotOscar = (function () {
  "use strict";

  const NIVELES = {
    1: { clave: "aprendiz", nombre: "Aprendiz", descripcion: "Juega rápido y sin pensar mucho: ideal para empezar." },
    2: { clave: "club", nombre: "De club", descripcion: "Mira una jugada adelante y no regala piezas." },
    3: { clave: "avanzado", nombre: "Avanzado", descripcion: "Busca tres jugadas adelante con poda alfa-beta." },
    4: { clave: "maestro", nombre: "Maestro", descripcion: "El nivel más fuerte: busca a fondo dentro de su tiempo. Cuesta mucho ganarle." },
  };

  const INFINITO = 999999;
  // Cuánto tiempo real de cálculo se permite cada nivel que busca a fondo,
  // antes de quedarse con lo mejor que ya encontró. Los niveles 1 y 2 no lo
  // usan (su búsqueda es tan chica que no hace falta cortarla).
  const PRESUPUESTO_MS = { 3: 400, 4: 1200 };
  const PROFUNDIDAD_MAXIMA = { 3: 3, 4: 6 };
  // Cuántas jugadas explora cada nodo interno de la búsqueda (en la raíz se
  // exploran TODAS): de sobra para variantes con más movimientos posibles que
  // el ajedrez normal (Abrazos, Crazyhouse con drops) sin que la búsqueda se
  // dispare en tiempo.
  const RAMAS_POR_NODO = 24;
  // Señal interna de "se acabó el tiempo de esta iteración" — nunca sale de
  // este archivo, solo la ve el catch de la propia profundización iterativa.
  const TIEMPO_AGOTADO = {};

  function azar(n) { return Math.floor(Math.random() * n); }

  function barajar(lista) {
    const c = lista.slice();
    for (let i = c.length - 1; i > 0; i--) { const j = azar(i + 1); const t = c[i]; c[i] = c[j]; c[j] = t; }
    return c;
  }

  /* Las primeras `n` de la lista, al azar y sin barajar el resto: cuando solo
     se van a mirar ocho de cuarenta jugadas, revolver las cuarenta es trabajo
     tirado. Se copia igual porque la lista es del motor y no se toca. */
  function muestraAlAzar(lista, n) {
    const c = lista.slice();
    const tope = Math.min(n, c.length);
    for (let i = 0; i < tope; i++) {
      const j = i + azar(c.length - i);
      const t = c[i]; c[i] = c[j]; c[j] = t;
    }
    c.length = tope;
    return c;
  }

  /* El signo con el que mira el tablero: material() siempre cuenta a favor de
     las blancas, así que las negras buscan el mínimo. */
  const signo = (color) => (color === "w" ? 1 : -1);

  /* ---------------- Lo que ya cortó una vez, se prueba primero ----------------
     `valorJugada()` ordena muy bien donde hay capturas y se queda ciego donde
     no las hay: en un final de peones TODAS las jugadas valen casi lo mismo y
     el orden sale prácticamente al azar — justo en la clase de posición donde
     más hace falta buscar hondo.
     El historial lo arregla con lo que la propia búsqueda va aprendiendo: cada
     vez que una jugada provoca un corte de la poda se le suma un punto, y la
     próxima vez que aparezca —en otra rama, a otra profundidad— se prueba
     antes. Un corte cerca de la raíz vale más que uno en el fondo, porque se
     ahorra un subárbol más grande: de ahí el `profundidad * profundidad`.
     Es una tabla de cuatro mil entradas como mucho y se vacía en cada jugada:
     lo aprendido en la posición anterior ya no sirve para esta.
     Ordenar mal no da ningún resultado equivocado —alfa-beta devuelve lo mismo
     en cualquier orden—, solo poda menos. Por eso esto es solo velocidad. */
  let historial = Object.create(null);

  function claveJugada(j, lado) {
    const quien = lado > 0 ? "w" : "b";
    return j.drop ? quien + "*" + j.piece + j.to : quien + j.from + j.to;
  }

  /* Del conteo crudo a un empujón acotado: `h / (h + 50)` nunca llega a 1, así
     que el bono se queda por debajo de 0.9 de peón y puede reordenar jugadas
     tranquilas entre ellas sin llegar a colarse delante de una captura buena.
     Sin ese techo, una jugada con mil cortes encima taparía a cualquier otra. */
  function bonoHistorial(clave) {
    const h = historial[clave];
    return h ? 0.9 * (h / (h + 50)) : 0;
  }

  /* ---------------- Nivel 1: al azar, con gusto por las capturas ---------------- */
  function nivelAprendiz(ad) {
    const jugadas = ad.jugadas();
    if (!jugadas.length) return null;
    // Con una de cada tres, se queda con la que más material gane; el resto del
    // tiempo juega lo primero que se le ocurre. Así comete errores de verdad.
    if (azar(3) !== 0) return jugadas[azar(jugadas.length)];
    const candidatas = muestraAlAzar(jugadas, 8);
    let mejor = candidatas[0], mejorValor = -INFINITO;
    const yo = signo(ad.turno());
    candidatas.forEach((j) => {
      const despues = ad.probar(j);
      if (!despues) return;
      const v = yo * despues.material();
      if (v > mejorValor) { mejorValor = v; mejor = j; }
    });
    return mejor;
  }

  /* ---------------- Nivel 2: una jugada, mirando la respuesta ---------------- */
  function nivelClub(ad) {
    const jugadas = barajar(ad.jugadas());
    if (!jugadas.length) return null;
    const yo = signo(ad.turno());
    let mejor = jugadas[0], mejorValor = -INFINITO;
    jugadas.forEach((j) => {
      const despues = ad.probar(j);
      if (!despues) return;
      let v = yo * despues.material();
      // La respuesta del rival: si puede quedarse con algo, descontarlo.
      const respuestas = despues.jugadas();
      if (respuestas.length) {
        let peor = INFINITO;
        const muestra = muestraAlAzar(respuestas, 12);
        for (let i = 0; i < muestra.length; i++) {
          const luego = despues.probar(muestra[i]);
          if (!luego) continue;
          if (luego.material() * yo < peor) peor = yo * luego.material();
          // `peor` es un mínimo: solo puede bajar. En cuanto queda por debajo
          // de lo mejor que ya se encontró, esta jugada ya no va a ganar por
          // más respuestas que se miren — y cada una cuesta un clon. Cortar
          // acá da EXACTAMENTE el mismo resultado con la mitad del trabajo.
          if (peor <= mejorValor) break;
        }
        if (peor !== INFINITO) v = peor;
      } else if (typeof despues.enJaque !== "function" || despues.enJaque()) {
        // Sin respuestas Y en jaque: es mate de verdad. Sin la comprobación
        // de enJaque(), un ahogado (tablas) se contaba como si fuera tan
        // bueno como un mate, y el bot podía ir a buscar el ahogado en vez
        // de seguir ganando.
        v += 50;
      }
      if (v > mejorValor) { mejorValor = v; mejor = j; }
    });
    return mejor;
  }

  /* ---------------- Niveles 3 y 4: poda alfa-beta con profundización iterativa ----------------
     Las dos comparten el mismo buscador (negamax con poda alfa-beta y las
     jugadas ordenadas de mejor a peor antes de explorarlas): lo único que
     cambia es cuánto tiempo y cuánta profundidad tope se les da. */

  /* Deja las jugadas de mejor a peor para quien va a mover, y devuelve pares
     {j, despues}. Dos caminos, y la diferencia es lo que cuesta cada uno:

     - Con `valorJugada()`: el adaptador puntúa cada jugada MIRÁNDOLA, sin
       jugarla. `despues` queda en null y lo paga el bucle de la búsqueda,
       solo por las ramas en las que de verdad entra.
     - Sin ella: el orden de siempre, clonando la posición de cada jugada para
       verle el material. `despues` ya viene hecho y se reusa, así que no se
       clona nada dos veces.

     El recorte a RAMAS_POR_NODO se hace bajando el `length` en vez de con
     `slice()`: una copia menos, y de paso suelta las posiciones sobrantes para
     que el recolector se las lleve en vez de tenerlas vivas todo el subárbol. */
  function jugadasOrdenadas(ad, jugadas, yo) {
    const anotadas = [];
    if (typeof ad.valorJugada === "function") {
      for (let i = 0; i < jugadas.length; i++) {
        const clave = claveJugada(jugadas[i], yo);
        anotadas.push({ j: jugadas[i], despues: null, clave, v: ad.valorJugada(jugadas[i]) + bonoHistorial(clave) });
      }
    } else {
      for (let i = 0; i < jugadas.length; i++) {
        const despues = ad.probar(jugadas[i]);
        if (!despues) continue;
        anotadas.push({ j: jugadas[i], despues, clave: null, v: yo * despues.material() });
      }
    }
    anotadas.sort((a, b) => b.v - a.v);
    if (anotadas.length > RAMAS_POR_NODO) anotadas.length = RAMAS_POR_NODO;
    return anotadas;
  }

  // Sin jugadas es jaque mate O ahogado, y son polos opuestos: uno es lo peor
  // que le puede pasar a quien mueve, el otro son tablas puras — un rey solo
  // contra una dama vale tanto como nada si ese rey queda ahogado, y un bot
  // que no distinga los dos casos puede EMPUJAR la posición hacia el ahogado
  // pensando que es tan bueno como el mate, tirando a la basura una ventaja
  // ganada (es justo lo que hacía antes de este arreglo). `MATE_BASE +
  // profundidad` hace que un mate encontrado más cerca de la raíz valga más
  // que uno más lejano, así el bot prefiere el camino más corto al mate.
  const MATE_BASE = 90000;
  function valorSinJugadas(ad, profundidad) {
    if (typeof ad.enJaque === "function") return ad.enJaque() ? -(MATE_BASE + profundidad) : 0;
    return -1000; // el adaptador no distingue mate de ahogado (p. ej. el nodo de una sola jugada de Duelo): se mantiene el criterio de siempre
  }

  function negamax(ad, profundidad, alfa, beta, lado, limiteTiempo) {
    if (Date.now() > limiteTiempo) throw TIEMPO_AGOTADO;
    if (profundidad === 0) return lado * ad.material();
    const jugadas = ad.jugadas();
    if (!jugadas.length) return valorSinJugadas(ad, profundidad);
    const ordenadas = jugadasOrdenadas(ad, jugadas, lado);
    let mejor = -INFINITO;
    for (let i = 0; i < ordenadas.length; i++) {
      const entrada = ordenadas[i];
      const despues = entrada.despues || ad.probar(entrada.j);
      entrada.despues = null; // ya no hace falta: que no quede viva durante todo el subárbol
      if (!despues) continue;
      // A una jugada del fondo, el valor de la rama ES el material de la
      // posición que queda: bajar un nivel más solo para que negamax devuelva
      // `lado * material()` costaba una llamada y una SEGUNDA evaluación de
      // la misma posición (jugadasOrdenadas ya la había mirado). Da el mismo
      // número, exactamente.
      const v = profundidad === 1
        ? lado * despues.material()
        : -negamax(despues, profundidad - 1, -beta, -alfa, -lado, limiteTiempo);
      if (v > mejor) mejor = v;
      if (mejor > alfa) alfa = mejor;
      if (alfa >= beta) {
        // Poda: el rival ya tiene algo mejor en otra rama, esta no va a
        // elegir. Y queda anotado que esta jugada corta, para probarla antes
        // la próxima vez que aparezca.
        if (entrada.clave) historial[entrada.clave] = (historial[entrada.clave] || 0) + profundidad * profundidad;
        break;
      }
    }
    return mejor === -INFINITO ? lado * ad.material() : mejor;
  }

  function nivelBusquedaProfunda(ad, profundidadMaxima, presupuestoMs) {
    const jugadasRaiz = ad.jugadas();
    if (!jugadasRaiz.length) return null;
    const yo = signo(ad.turno());
    const limiteTiempo = Date.now() + presupuestoMs;
    historial = Object.create(null); // lo aprendido en la jugada anterior ya no vale acá
    // Semilla de seguridad: si el tiempo se agotara antes de terminar la
    // primerísima profundidad (no debería, con solo 1 jugada de búsqueda),
    // igual hay algo legal para jugar.
    let mejorGlobal = jugadasRaiz[azar(jugadasRaiz.length)];
    // Las posiciones de la raíz se clonan UNA sola vez y se reusan en todas
    // las profundidades: son unas cuarenta, caben de sobra, y volver a
    // clonarlas en cada iteración era pagar seis veces lo mismo.
    const raiz = jugadasOrdenadas(ad, barajar(jugadasRaiz), yo);
    for (let i = 0; i < raiz.length; i++) {
      if (!raiz[i].despues) raiz[i].despues = ad.probar(raiz[i].j);
    }
    for (let profundidad = 1; profundidad <= profundidadMaxima; profundidad++) {
      try {
        let mejor = raiz.length ? raiz[0].j : mejorGlobal, alfa = -INFINITO;
        for (let i = 0; i < raiz.length; i++) {
          const { j, despues } = raiz[i];
          if (!despues) continue;
          const v = profundidad === 1
            ? yo * despues.material()
            : -negamax(despues, profundidad - 1, -INFINITO, -alfa, -yo, limiteTiempo);
          raiz[i].v = v;
          if (v > alfa) { alfa = v; mejor = j; }
        }
        mejorGlobal = mejor; // esta profundidad terminó completa: ya se puede confiar en ella
        // Y lo que se aprendió se aprovecha: la próxima profundidad empieza
        // por la que quedó mejor acá. Es de lo que vive la profundización
        // iterativa — con la mejor primero, la poda corta casi todo el resto
        // de una; sin esto, cada vuelta redescubría el orden desde cero.
        raiz.sort((a, b) => b.v - a.v);
      } catch (e) {
        break; // se acabó el tiempo a mitad de esta profundidad: nos quedamos con la anterior
      }
      if (Date.now() > limiteTiempo) break;
    }
    return mejorGlobal;
  }

  /* ---------------- Puerta de entrada ---------------- */
  function jugar(ad, nivel) {
    const n = Number(nivel) || 2;
    try {
      if (n <= 1) return nivelAprendiz(ad);
      if (n === 2) return nivelClub(ad);
      return nivelBusquedaProfunda(ad, PROFUNDIDAD_MAXIMA[n] || PROFUNDIDAD_MAXIMA[3], PRESUPUESTO_MS[n] || PRESUPUESTO_MS[3]);
    } catch (e) {
      // Ante cualquier sorpresa de una variante rara, algo legal siempre.
      const jugadas = ad.jugadas();
      return jugadas.length ? jugadas[azar(jugadas.length)] : null;
    }
  }

  /* Cuánto tarda en "pensar": lo justo para que se vea que el rival mueve y no
     que la pantalla salta sola. Para los niveles que buscan a fondo, el propio
     cálculo YA tarda su presupuesto de tiempo (es síncrono, así que el
     navegador se nota ocupado ese rato) — la demora de acá es lo que se suma
     ENCIMA, y por eso es chica: sumarle el presupuesto completo otra vez
     dejaría al Maestro pensando más de dos segundos por jugada. */
  function demora(nivel) {
    const n = Number(nivel);
    if (n >= 4) return 300;
    if (n === 3) return 350;
    return 450;
  }

  return { jugar, demora, NIVELES };
})();
