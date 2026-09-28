/**
 * Ajedrez Integral — lo que comparten las páginas de ejercicios de Entrenamiento.
 *
 * Temas, Mates, Practicar, Desafíos y Visualización tenían cada una su copia
 * de lo mismo: la racha, el orden en que se dibuja el tablero, qué cuenta como
 * acierto y cómo se elige la pieza al coronar. Las copias se fueron separando
 * y cada diferencia era un error que no daba ningún error: Mates rechazaba un
 * mate que no era el guardado y dibujaba siempre desde las blancas, «Ver
 * solución» subía la racha en Practicar, la coronación de Mates no decía qué
 * pieza era cada botón. Acá está una sola vez.
 *
 *   EjercicioTablero.racha(prefijo)
 *       La racha de una página, guardada en `<prefijo>_streak` y
 *       `<prefijo>_best` (las dos en CLAVES de js/progreso-usuario.js) y
 *       pintada en #streak-count, #streak-best y #streak-bar. Devuelve
 *       { getStreak, getBestStreak, setStreak, bumpStreak, resetStreak }.
 *
 *   EjercicioTablero.casillas(orientacion)
 *       Las 64 casillas en el orden en que se dibujan, mirando desde el bando
 *       `orientacion` ("w" o "b"): el tablero se mira desde el que juega.
 *
 *   EjercicioTablero.esAcierto(juego, jugada, esperada)
 *       La jugada ya hecha en `juego` es la esperada (SAN) o da mate. Los
 *       bancos guardan UNA solución y a veces hay más de un mate.
 *
 *   EjercicioTablero.jugarCoronando(juego, desde, hasta, jugar)
 *       Si de `desde` a `hasta` se corona, pregunta en qué pieza con
 *       js/coronacion.js (el mismo diálogo de todo el sitio) y llama
 *       `jugar(pieza)`; si no, llama `jugar(undefined)` enseguida. Cancelar
 *       no juega nada.
 */
(function () {
  "use strict";

  const COLUMNAS = ["a", "b", "c", "d", "e", "f", "g", "h"];

  function racha(prefijo) {
    const CLAVE = prefijo + "_streak", MEJOR = prefijo + "_best";
    const leer = (k) => { try { return parseInt(localStorage.getItem(k) || "0", 10) || 0; } catch (e) { return 0; } };
    const escribir = (k, v) => { try { localStorage.setItem(k, String(v)); } catch (e) {} };
    function getStreak() { return leer(CLAVE); }
    function getBestStreak() { return leer(MEJOR); }
    function setStreak(n) {
      escribir(CLAVE, n);
      const mejor = Math.max(getBestStreak(), n);
      escribir(MEJOR, mejor);
      const c = document.getElementById("streak-count"), b = document.getElementById("streak-best");
      if (c) c.textContent = n;
      if (b) b.textContent = mejor;
    }
    function bumpStreak() {
      setStreak(getStreak() + 1);
      const bar = document.getElementById("streak-bar");
      if (bar) { bar.classList.remove("pulse"); void bar.offsetWidth; bar.classList.add("pulse"); }
    }
    function resetStreak() { setStreak(0); }
    return { getStreak, getBestStreak, setStreak, bumpStreak, resetStreak };
  }

  function casillas(orientacion) {
    const filas = orientacion === "b" ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
    const columnas = orientacion === "b" ? COLUMNAS.slice().reverse() : COLUMNAS;
    const r = [];
    filas.forEach((f) => columnas.forEach((c) => r.push(c + f)));
    return r;
  }

  function esAcierto(juego, jugada, esperada) {
    if (!jugada) return false;
    if (jugada.san === esperada) return true;
    try { return !!juego.in_checkmate(); } catch (e) { return false; }
  }

  function jugarCoronando(juego, desde, hasta, jugar) {
    if (window.Coronacion && Coronacion.hayQueElegir(juego, desde, hasta)) {
      Coronacion.pedir(juego.turn(), (pieza) => { if (pieza) jugar(pieza); });
      return;
    }
    jugar(undefined);
  }

  const api = { racha, casillas, esAcierto, jugarCoronando };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.EjercicioTablero = api;
})();
