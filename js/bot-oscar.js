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
 * Con eso alcanza para tres niveles:
 *
 *   1 Aprendiz — juega al azar, con un empujón hacia las capturas. Para quien
 *                está aprendiendo a mover: pierde piezas y deja ganar.
 *   2 Club     — mira una jugada adelante y se queda con la mejor, pero además
 *                comprueba la respuesta del rival: así no regala piezas por
 *                tomar un peón.
 *   3 Profe    — dos jugadas completas de búsqueda con poda alfa-beta.
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
    3: { clave: "profe", nombre: "Profe", descripcion: "Calcula dos jugadas completas. Cuesta ganarle." },
  };

  const INFINITO = 99999;

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
      } else {
        // Sin respuestas: o lo ahogó o lo dio mate. Lo segundo es lo que busca.
        v += 50;
      }
      if (v > mejorValor) { mejorValor = v; mejor = j; }
    });
    return mejor;
  }

  /* ---------------- Nivel 3: dos jugadas con poda alfa-beta ---------------- */
  function nivelProfe(ad) {
    const jugadas = barajar(ad.jugadas());
    if (!jugadas.length) return null;
    const yo = signo(ad.turno());
    let mejor = jugadas[0], alfa = -INFINITO;
    jugadas.forEach((j) => {
      const despues = ad.probar(j);
      if (!despues) return;
      const v = -negamax(despues, 2, -INFINITO, -alfa, -yo);
      if (v > alfa) { alfa = v; mejor = j; }
    });
    return mejor;
  }

  function negamax(ad, profundidad, alfa, beta, lado) {
    if (profundidad === 0) return lado * ad.material();
    const jugadas = ad.jugadas();
    if (!jugadas.length) return lado * ad.material() - 50;   // sin jugadas: malo para quien mueve
    let mejor = -INFINITO;
    for (const j of barajar(jugadas).slice(0, 18)) {
      const despues = ad.probar(j);
      if (!despues) continue;
      const v = -negamax(despues, profundidad - 1, -beta, -alfa, -lado);
      if (v > mejor) mejor = v;
      if (mejor > alfa) alfa = mejor;
      if (alfa >= beta) break;
    }
    return mejor === -INFINITO ? lado * ad.material() : mejor;
  }

  /* ---------------- Puerta de entrada ---------------- */
  function jugar(ad, nivel) {
    const n = Number(nivel) || 2;
    try {
      if (n <= 1) return nivelAprendiz(ad);
      if (n === 2) return nivelClub(ad);
      return nivelProfe(ad);
    } catch (e) {
      // Ante cualquier sorpresa de una variante rara, algo legal siempre.
      const jugadas = ad.jugadas();
      return jugadas.length ? jugadas[azar(jugadas.length)] : null;
    }
  }

  /* Cuánto tarda en "pensar": lo justo para que se vea que el rival mueve y no
     que la pantalla salta sola. */
  function demora(nivel) {
    return Number(nivel) >= 3 ? 700 : 450;
  }

  return { jugar, demora, NIVELES };
})();
