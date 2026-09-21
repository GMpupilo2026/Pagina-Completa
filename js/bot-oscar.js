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

  /* El signo con el que mira el tablero: material() siempre cuenta a favor de
     las blancas, así que las negras buscan el mínimo. */
  const signo = (color) => (color === "w" ? 1 : -1);

  /* ---------------- Nivel 1: al azar, con gusto por las capturas ---------------- */
  function nivelAprendiz(ad) {
    const jugadas = barajar(ad.jugadas());
    if (!jugadas.length) return null;
    // Con una de cada tres, se queda con la que más material gane; el resto del
    // tiempo juega lo primero que se le ocurre. Así comete errores de verdad.
    if (azar(3) !== 0) return jugadas[0];
    let mejor = jugadas[0], mejorValor = -INFINITO;
    const yo = signo(ad.turno());
    jugadas.slice(0, 8).forEach((j) => {
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
        barajar(respuestas).slice(0, 12).forEach((r) => {
          const luego = despues.probar(r);
          if (!luego) return;
          peor = Math.min(peor, yo * luego.material());
        });
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
     cambia es cuánto tiempo y cuánta profundidad tope se les da.

     El ORDEN de las jugadas es lo que hace que la poda corte de verdad: si se
     exploran al azar, alfa-beta tarda en darse cuenta de qué rama es mala; si
     se prueba primero la que la propia evaluación ya dice que es mejor, la
     mayoría de las ramas restantes se descartan en un vistazo. Cuesta un
     `probar()` extra por jugada (evaluarla antes de explorarla a fondo), pero
     sale ganando de sobra en cuántos nodos deja de visitar. */

  // Evalúa cada jugada con la posición resultante (sin buscar más adentro) y
  // las deja de mejor a peor para quien va a mover. Devuelve pares {j,
  // despues} — el `despues` ya calculado se reusa al explorar, así no se
  // vuelve a "jugar" la misma jugada dos veces.
  function jugadasOrdenadas(ad, jugadas, yo) {
    const anotadas = [];
    jugadas.forEach((j) => {
      const despues = ad.probar(j);
      if (!despues) return;
      anotadas.push({ j, despues, v: yo * despues.material() });
    });
    anotadas.sort((a, b) => b.v - a.v);
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
    const ordenadas = jugadasOrdenadas(ad, jugadas, lado).slice(0, RAMAS_POR_NODO);
    let mejor = -INFINITO;
    for (const { despues } of ordenadas) {
      const v = -negamax(despues, profundidad - 1, -beta, -alfa, -lado, limiteTiempo);
      if (v > mejor) mejor = v;
      if (mejor > alfa) alfa = mejor;
      if (alfa >= beta) break; // poda: el rival ya tiene algo mejor en otra rama, esta no va a elegir
    }
    return mejor === -INFINITO ? lado * ad.material() : mejor;
  }

  function nivelBusquedaProfunda(ad, profundidadMaxima, presupuestoMs) {
    const jugadasRaiz = ad.jugadas();
    if (!jugadasRaiz.length) return null;
    const yo = signo(ad.turno());
    const limiteTiempo = Date.now() + presupuestoMs;
    // Semilla de seguridad: si el tiempo se agotara antes de terminar la
    // primerísima profundidad (no debería, con solo 1 jugada de búsqueda),
    // igual hay algo legal para jugar.
    let mejorGlobal = jugadasRaiz[azar(jugadasRaiz.length)];
    for (let profundidad = 1; profundidad <= profundidadMaxima; profundidad++) {
      try {
        const ordenadas = jugadasOrdenadas(ad, barajar(jugadasRaiz), yo);
        let mejor = ordenadas.length ? ordenadas[0].j : mejorGlobal, alfa = -INFINITO;
        for (const { j, despues } of ordenadas) {
          const v = -negamax(despues, profundidad - 1, -INFINITO, -alfa, -yo, limiteTiempo);
          if (v > alfa) { alfa = v; mejor = j; }
        }
        mejorGlobal = mejor; // esta profundidad terminó completa: ya se puede confiar en ella
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
