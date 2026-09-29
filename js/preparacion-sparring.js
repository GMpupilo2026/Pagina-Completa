/* Preparación de rivales: «Juega contra él».
 *
 * Una partida de práctica contra el rival, en el tablero de
 * js/entrenador-linea.js (su partida libre). Mientras el rival esté en SU
 * libro (lo que jugó en sus partidas, js/preparacion-libro.js), juega lo que
 * él juega: en cada posición sortea entre sus jugadas con el peso de las
 * veces que hizo cada una, y dice cuánto la juega. Cuando la posición ya no
 * está en su libro, sigue Stockfish con la fuerza limitada a su Elo
 * (UCI_LimitStrength), y la página lo dice en ese momento. Al terminar dice
 * hasta dónde se siguió el plan, dónde te saliste y dónde se salió él.
 *
 * Lo usan preparacion-rivales.html (el profesor, con el análisis entero) y
 * plan-rival.html (el alumno, con el libro que viaja en su plan). No guarda
 * nada: es práctica. Ver «Juega contra él» en docs/decisiones/paneles.md.
 *
 *   const s = PreparacionSparring.montar(contenedor);
 *   s.empezar({ libro, plan, color: "w", elo: 1850, rival: "Pedro" });
 */
window.PreparacionSparring = (function () {
  "use strict";

  const Lb = () => window.PreparacionLibro;
  const L = () => window.PreparacionLineas;
  // Lo que acepta Stockfish en UCI_Elo (16 y 19).
  const ELO_MIN = 1320, ELO_MAX = 3190, ELO_SIN_DATO = 1800;
  const TIEMPO_MOTOR = 600;   // ms por jugada: a fuerza limitada no hace falta más

  function el(tag, clase, texto) {
    const e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto != null) e.textContent = texto;
    return e;
  }

  const numerada = (i, san) => (i % 2 === 0 ? (i / 2 + 1) + "." : Math.floor(i / 2 + 1) + "…") + L().sanEs(san);
  const pctEntero = (x) => Math.round(x * 100) + " %";
  const eloDelMotor = (elo) => Math.min(ELO_MAX, Math.max(ELO_MIN, Math.round(elo || ELO_SIN_DATO)));

  /* Una jugada de Stockfish con la fuerza limitada a `elo`, en SAN; null si
     no hay motor o no contestó. Usa la misma cola que las evaluaciones
     (SharedEngine.runTask) y deja el motor a toda su fuerza al terminar: en
     preparacion-rivales.html el mismo motor revisa el plan. */
  function jugadaDelMotor(fen, elo) {
    if (!window.SharedEngine) return Promise.resolve(null);
    return SharedEngine.runTask(async () => {
      const motor = await SharedEngine.ensureEngine();
      if (!motor) return null;
      return new Promise((res) => {
        const listo = (san) => {
          clearTimeout(espera);
          SharedEngine.setMessageHandler(null);
          motor.postMessage("setoption name UCI_LimitStrength value false");
          res(san);
        };
        const espera = setTimeout(() => { motor.postMessage("stop"); setTimeout(() => listo(null), 2000); }, 15000);
        SharedEngine.setMessageHandler((ev) => {
          const linea = typeof ev.data === "string" ? ev.data : "";
          if (!linea.startsWith("bestmove")) return;
          const uci = linea.split(/\s+/)[1];
          if (!uci || uci === "(none)") { listo(null); return; }
          const mv = new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined });
          listo(mv ? mv.san : null);
        });
        motor.postMessage("setoption name UCI_LimitStrength value true");
        motor.postMessage("setoption name UCI_Elo value " + eloDelMotor(elo));
        motor.postMessage("position fen " + fen);
        motor.postMessage("go movetime " + TIEMPO_MOTOR + " depth " + (SharedEngine.PROFUNDIDAD_MAXIMA || 40));
      });
    });
  }

  function montar(contenedor) {
    contenedor.textContent = "";
    const tableroCaja = el("div");
    const resumen = el("div", "mt-4");
    resumen.setAttribute("role", "status");
    resumen.dataset.sparringResumen = "";
    contenedor.append(tableroCaja, resumen);
    const entrenador = window.EntrenadorLinea.montar(tableroCaja, { nombre: "Tablero de la partida contra el rival" });

    function empezar(cfg) {
      const color = cfg.color === "b" ? "b" : "w";
      const nombre = cfg.rival || "el rival";
      // Qué pasó, para el resumen: sus jugadas de libro y dónde salió de él.
      const estado = { deLibro: 0, suyas: 0, salioEn: null, desvioDicho: false };
      resumen.textContent = "";

      entrenador.jugarLibre({
        color,
        titulo: "Juegas con " + (color === "w" ? "blancas" : "negras") + " contra " + nombre,
        rival: async (juego) => {
          const i = juego.history().length;
          estado.suyas += 1;
          const x = Lb().elegir(cfg.libro, juego.fen());
          if (x) {
            estado.deLibro += 1;
            return { san: x.san, nota: "La juega " + pctEntero(x.reparto) + " de las veces en esta posición (" + x.n + (x.n === 1 ? " partida)." : " partidas).") };
          }
          const primera = estado.salioEn == null;
          if (primera) estado.salioEn = i;
          const san = await jugadaDelMotor(juego.fen(), cfg.elo);
          if (!san) return null;
          return { san, nota: primera ? "Aquí se acaba lo que él juega en sus partidas: desde ahora juega Stockfish a su nivel (Elo " + eloDelMotor(cfg.elo) + ")." : "" };
        },
        // Tu jugada contra el plan: se dice una vez, la primera que se aparta.
        alJugar: (hecha, juego) => {
          const sec = juego.history();
          const s = Lb().seguirPlan(cfg.plan, sec, color);
          if (s.desvio && s.desvio.i === sec.length - 1 && !estado.desvioDicho) {
            estado.desvioDicho = true;
            return "El plan decía " + numerada(s.desvio.i, s.desvio.plan) + ".";
          }
          if (!s.desvio && !s.sinPreparar && s.seguidas === sec.length) return "Es la del plan.";
          return "";
        },
        alTerminar: ({ sec, motivo }) => pintarResumen(cfg, color, sec, motivo, estado),
      });
      entrenador.enfocar();
    }

    function pintarResumen(cfg, color, sec, motivo, estado) {
      resumen.textContent = "";
      const titulo = el("p", "font-semibold text-brand-800 dark:text-white mb-1", "Cómo te fue");
      const ul = el("ul", "list-disc pl-5 text-sm text-brand-700 dark:text-brand-100 space-y-1");
      const item = (t) => ul.appendChild(el("li", null, t));
      if (motivo === "mate") item(sec.length % 2 === (color === "w" ? 1 : 0) ? "Ganaste: le diste mate." : "Te dio mate.");
      else if (motivo === "tablas") item("Terminó en tablas.");
      else if (motivo === "sin-jugada") item("Aquí se acabó lo que él juega y Stockfish no contestó, así que la partida se terminó.");
      const s = Lb().seguirPlan(cfg.plan, sec, color);
      if (s.desvio) item("Te saliste del plan en " + numerada(s.desvio.i, s.desvio.jugada) + ": el plan decía " + numerada(s.desvio.i, s.desvio.plan) + ".");
      else if (s.sinPreparar) item("Seguiste el plan hasta que él jugó " + numerada(s.sinPreparar.i, s.sinPreparar.jugada) + ", que el plan no prepara.");
      else if (s.seguidas && s.fin) item("Seguiste el plan hasta el final.");
      else if (s.seguidas) item("Ibas en el plan cuando terminó la partida.");
      if (estado.suyas) {
        const i = estado.salioEn;
        item(i == null
          ? "Todas sus jugadas (" + estado.suyas + ") salieron de sus partidas."
          : estado.deLibro + (estado.deLibro === 1 ? " jugada suya salió" : " jugadas suyas salieron") + " de sus partidas; " +
            (sec[i] ? "desde " + numerada(i, sec[i]) : "desde la jugada " + (Math.floor(i / 2) + 1)) + " jugó Stockfish a su nivel.");
      }
      resumen.append(titulo, ul);
    }

    return { empezar, entrenador };
  }

  return { montar, jugadaDelMotor, eloDelMotor };
})();
