/* Preparación de rivales: la revisión con Stockfish.
 *
 * Toma las jugadas de los planes (PreparacionAnalisis.tareasDelMotor) y evalúa,
 * para cada una, la posición de antes y la de después con el Stockfish que
 * pidió la página (Stockfish 19 lite, por el data-motor de su <script>). Cada
 * posición se evalúa una sola vez aunque aparezca en dos tareas.
 *
 *   revisar(r, { alAvanzar(hechas, total), parar() → bool })
 *     → { tareas, evals, hechas, detalle, error }
 *
 * Lo que ya se revisó (r.motor.lineas) no se vuelve a pedir: cuando el plan
 * cambia (llega el cruce con un alumno y el plan pasa a ser a su medida),
 * se revisa solo lo nuevo.
 *   faltan(r) → cuántas tareas no tienen todavía su evaluación
 */
(function () {
  "use strict";

  const A = window.PreparacionAnalisis;
  // Stockfish 19 lite, en un hilo. A profundidad 18 tarda entre medio segundo y
  // uno por posición en una computadora de escritorio: la revisión entera, un
  // par de minutos en una modesta.
  const PROFUNDIDAD = 18;
  const MOTOR = "Stockfish 19 lite";

  function evalBlancas(fen, puntaje) {
    return fen.split(" ")[1] === "w" ? puntaje : -puntaje;
  }

  // Una posición: { eval desde las blancas, mejor (SAN) }. `profundidad`,
  // si no la de siempre (la revisión táctica usa menos: son muchas).
  function evaluar(fen, profundidad) {
    const g = new Chess(fen);
    if (g.in_checkmate()) return Promise.resolve({ eval: evalBlancas(fen, -100), mejor: null });
    if (g.in_draw() || g.in_stalemate()) return Promise.resolve({ eval: 0, mejor: null });
    return SharedEngine.runTask(async () => {
      const motor = await SharedEngine.ensureEngine();
      if (!motor) throw new Error("No se pudo cargar Stockfish");
      return new Promise((res, rej) => {
        let ultimo = null;
        let espera2 = null;
        const espera = setTimeout(() => {
          motor.postMessage("stop");
          espera2 = setTimeout(() => {
            SharedEngine.setMessageHandler(null);
            SharedEngine.discardEngine();
            rej(new Error("Stockfish no respondió"));
          }, 4000);
        }, 20000);
        SharedEngine.setMessageHandler((ev) => {
          const linea = typeof ev.data === "string" ? ev.data : "";
          if (linea.startsWith("info") && / score /.test(linea) && !/bound/.test(linea)) {
            const m = linea.match(/ score (cp|mate) (-?\d+)/);
            if (m) {
              const v = parseInt(m[2], 10);
              ultimo = m[1] === "cp" ? v / 100 : (v > 0 ? 100 - v : v < 0 ? -100 - v : -100);
            }
          } else if (linea.startsWith("bestmove")) {
            clearTimeout(espera); clearTimeout(espera2);
            SharedEngine.setMessageHandler(null);
            const uci = linea.split(/\s+/)[1];
            let mejor = null;
            if (uci && uci !== "(none)") {
              const mv = new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined });
              mejor = mv ? mv.san.replace(/[+#]$/, "") : null;
            }
            res({ eval: ultimo == null ? null : evalBlancas(fen, ultimo), mejor });
          }
        });
        motor.postMessage("position fen " + fen);
        motor.postMessage("go depth " + (profundidad || PROFUNDIDAD));
      });
    });
  }

  function disponible() { return !!(window.SharedEngine && window.Chess); }

  // Las evaluaciones que ya trae el resultado, por clave de tarea.
  function yaRevisadas(r) {
    const hechas = {};
    for (const x of (r.motor && r.motor.lineas) || []) {
      hechas[x.sec.concat(x.jugada).join(" ")] = { antes: x.antes, mejor: x.mejor, despues: x.despues };
    }
    return hechas;
  }

  function faltan(r) {
    const ya = yaRevisadas(r);
    return A.tareasDelMotor(r).filter((t) => !ya[t.clave]).length;
  }

  async function revisar(r, o) {
    const tareas = A.tareasDelMotor(r);
    const cache = new Map();
    const evals = {};
    const ya = yaRevisadas(r);
    let hechas = 0, error = null;
    const cuando = (fen) => {
      if (!cache.has(fen)) cache.set(fen, evaluar(fen));
      return cache.get(fen);
    };
    try {
      for (const t of tareas) {
        if (o.parar && o.parar()) break;
        if (ya[t.clave]) { evals[t.clave] = ya[t.clave]; hechas += 1; continue; }
        if (o.alAvanzar) o.alAvanzar(hechas, tareas.length);
        const antes = A.fenDe(t.sec);
        const despues = A.fenDe(t.sec.concat(t.jugada));
        if (antes && despues) {
          const [ea, ed] = [await cuando(antes), await cuando(despues)];
          evals[t.clave] = { antes: ea.eval, mejor: ea.mejor, despues: ed.eval };
        }
        hechas += 1;
      }
    } catch (e) {
      console.error(e);
      error = e;
    }
    const detalle = MOTOR + ", profundidad " + PROFUNDIDAD + ", " + hechas + " de " + tareas.length + " jugadas revisadas";
    return { tareas: tareas.slice(0, hechas), evals, hechas, total: tareas.length, detalle, error };
  }

  /* La táctica, con Stockfish (r.tactica viene del análisis: el reconocedor
     de patrones, sin motor). Dos cosas, a profundidad 14:
       - los momentos decisivos: ¿la jugada del que perdió fue un error de
         verdad (perdió 1,5 peones o más de golpe)? y ¿cuál era la buena?
       - las candidatas a «no la vio»: ¿tenía de verdad una jugada que
         ganaba (le dejaba 1 peón o más arriba) y la que jugó perdió 1,5 o
         más de eso? El tema es el de la mejor jugada de Stockfish
         (temaDeJugada), no el de la sospecha.
     Devuelve lo que se guarda en r.tacticaMotor. Ver «La táctica, revisada
     con Stockfish» en docs/decisiones/paneles.md. */
  const PROF_TACTICA = 14;
  const PERDIDA = 1.5;
  async function revisarTactica(r, o) {
    const t = r.tactica;
    if (!t || !t.momentos) return null;
    const T = window.PreparacionTactica;
    const cache = new Map();
    const ev = (fen) => { if (!cache.has(fen)) cache.set(fen, evaluar(fen, PROF_TACTICA)); return cache.get(fen); };
    const limpia = (san) => String(san || "").replace(/[+#]$/, "");
    const total = t.momentos.length + (t.candidatas || []).length;
    let hechas = 0, error = null;
    const momentos = [], noVio = [];
    // Antes y después de una jugada, desde el lado de quien la hace.
    async function jugar(fen, san) {
      const g = new Chess(fen);
      const mv = g.move(san, { sloppy: true });
      if (!mv) return null;
      const a = await ev(fen), d = await ev(g.fen());
      if (a.eval == null || d.eval == null) return null;
      const signo = fen.split(" ")[1] === "w" ? 1 : -1;
      return { antes: signo * a.eval, despues: signo * d.eval, mejor: a.mejor, jugada: limpia(mv.san) };
    }
    try {
      for (const m of t.momentos) {
        if (o.parar && o.parar()) break;
        if (o.alAvanzar) o.alAvanzar(hechas, total);
        const j = await jugar(m.fen, m.san);
        hechas += 1;
        if (!j) continue;
        const x = { gano: m.gano, tema: m.tema, confirmada: j.antes - j.despues >= PERDIDA, perdida: j.antes - j.despues, jugada: j.jugada, ply: m.ply, sec: m.sec };
        if (j.mejor && j.mejor !== j.jugada) x.mejor = j.mejor;
        ["enlace", "fecha", "oponente"].forEach((k) => { if (m[k]) x[k] = m[k]; });
        momentos.push(x);
      }
      for (const c of t.candidatas || []) {
        if (o.parar && o.parar()) break;
        if (o.alAvanzar) o.alAvanzar(hechas, total);
        const j = await jugar(c.fen, c.jugada);
        hechas += 1;
        if (!j || !j.mejor || j.mejor === j.jugada) continue;
        if (j.antes < 1 || j.antes - j.despues < PERDIDA) continue;
        const x = { tema: T.temaDeJugada(c.fen, j.mejor), mejor: j.mejor, jugada: j.jugada, perdida: j.antes - j.despues, ply: c.ply, sec: c.sec };
        ["enlace", "fecha", "oponente"].forEach((k) => { if (c[k]) x[k] = c[k]; });
        noVio.push(x);
      }
    } catch (e) {
      console.error(e);
      error = e;
    }
    const agrupar = (lista) => {
      const m = new Map();
      lista.forEach((x) => {
        if (!m.has(x.tema)) m.set(x.tema, { tema: x.tema, n: 0, ejemplos: [] });
        const g = m.get(x.tema);
        g.n += 1;
        if (g.ejemplos.length < 2) g.ejemplos.push(x);
      });
      return [...m.values()].sort((a, b) => b.n - a.n || (a.tema < b.tema ? -1 : 1));
    };
    return {
      detalle: MOTOR + ", profundidad " + PROF_TACTICA,
      hechas, total, error: error ? String(error.message || error) : null,
      momentos,
      candidatas: (t.candidatas || []).length,
      buscadas: t.buscadasNoVio || 0,
      noVio: agrupar(noVio),
    };
  }

  // `evaluar(fen)` sola también: el tablero de la línea la pide en cada paso.
  window.PreparacionMotor = { revisar, revisarTactica, faltan, evaluar, disponible, PROFUNDIDAD, MOTOR };
})();
